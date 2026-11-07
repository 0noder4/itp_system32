"""Build catalogue payloads and push drafts to Strapi (targus)."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

from django.conf import settings
from django.db.models import Prefetch
from django.utils import timezone

from companies.models import (
    STATUS_BASIC,
    STATUS_MAIN,
    STATUS_PARTENER,
    Company,
    Description,
    Feedback,
    Jobwall,
    MapLayout,
    Settings,
    Stand,
    WebsitePublication,
)
from companies.services.strapi_client import (
    StrapiAPIError,
    StrapiClient,
    StrapiConfigError,
)

logger = logging.getLogger(__name__)

SKIP_NOT_ACCEPTED = "stage_4_not_accepted"
SKIP_NO_LOGO = "missing_catalogue_logo"
SKIP_NO_DESCRIPTION = "missing_catalogue_description"


def partnership_type_for_strapi(company_status: str) -> str:
    if company_status == STATUS_MAIN:
        return "main"
    if company_status == STATUS_PARTENER:
        return "partner"
    if company_status == STATUS_BASIC:
        return "regular"
    return "regular"


def stand_label(stand: Optional[Stand]) -> str:
    if not stand or not stand.stand_number or stand.stand_number == "brak":
        return ""
    return stand.stand_number.strip()


def internal_name_for_company(company_id: int, edition_number: int) -> str:
    # Edition prefix: company ids can repeat after a DB reset, older Strapi docs must stay untouched.
    return f"itp{edition_number}-{company_id}"


def file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def payload_hash(payload: dict) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def export_hash(company_payload: dict, hall_map: dict) -> str:
    return payload_hash({"company": company_payload, "hall_map": hall_map})


# Job taxonomy entries that already exist in the website CMS (read from production):
# system choice -> (Strapi internalName, externalName shown on the website).
WEBSITE_WORK_MODELS = {
    "s": ("on-site", "stacjonarnie"),
    "z": ("remote", "zdalnie"),
    "h": ("hybrid", "hybrydowo"),
    "k": ("contest", "konkurs"),
    "m": ("mobile", "mobilna"),
}
WEBSITE_EMPLOYMENT_TYPES = {
    "pelen": ("1", "pełen etat"),
    "pol": ("1/2", "1/2 etatu"),
    "trzyczwarte": ("3/4", "3/4 etatu"),
    "el": ("flex", "elastyczny"),
}
WEBSITE_CONTRACTS = {
    "uop": ("UoP", "umowa o pracę"),
    "uoz": ("UoZ", "umowa o zlecenie"),
    "uod": ("UoD", "umowa o dzieło"),
    "b2b": ("B2B", "B2B"),
    "uos": ("internship", "staż / praktyki"),
}

# Strapi collection -> (job relation field, payload key holding the taxonomy internalName).
JOB_TAXONOMIES = {
    "work-models": ("workModels", "workModelKey"),
    "employment-types": ("employmentTypes", "employmentTypeKey"),
    "contracts": ("contracts", "contractKey"),
}


def website_taxonomy(mapping: dict[str, tuple[str, str]], value: str) -> tuple[str, str]:
    return mapping.get(value, ("", ""))


class CataloguePayloadBuilder:
    """Single source of truth for preview + export payloads."""

    def __init__(self):
        self._edition_number: Optional[int] = None

    @property
    def edition_number(self) -> int:
        if self._edition_number is None:
            self._edition_number = Settings.get_settings().edition_number
        return self._edition_number

    def build_company_payload(self, company: Company) -> dict:
        description = getattr(company, "description", None)
        stands = {s.day: s for s in company.stand_all.all()}
        day1 = stand_label(stands.get("day1"))
        day2 = stand_label(stands.get("day2"))
        descr_text = (description.descr if description else "") or ""
        logo_path = ""
        if description and description.logo_file:
            logo_path = description.logo_file.name
        return {
            "company_id": company.id,
            "internalName": internal_name_for_company(company.id, self.edition_number),
            "externalName": company.name,
            "partnershipType": partnership_type_for_strapi(company.status),
            "description": descr_text,
            "logo_media_path": logo_path,
            "stand": {
                "firstDay": day1,
                "secondDay": day2,
            },
            "jobs": [self.build_job_payload(job) for job in company.jobwalls.all()],
        }

    def build_job_payload(self, job: Jobwall) -> dict:
        work_model_key, work_model = website_taxonomy(WEBSITE_WORK_MODELS, job.form)
        employment_key, employment = website_taxonomy(WEBSITE_EMPLOYMENT_TYPES, job.workload)
        contract_key, contract = website_taxonomy(WEBSITE_CONTRACTS, job.contract)
        return {
            "id": job.id,
            "title": job.name,
            "workModel": work_model,
            "workModelKey": work_model_key,
            "employmentType": employment,
            "employmentTypeKey": employment_key,
            "contract": contract,
            "contractKey": contract_key,
            "outline": job.description or "",
            "benefits": job.benefits or "",
            "requirements": job.requirements or "",
            "contact": (job.url or "").strip(),
        }

    def build_hall_map_payload(self) -> dict:
        layout = MapLayout.get_solo()
        return {
            "day1": layout.day1 or {},
            "day2": layout.day2 or {},
        }

    def stage4_accepted(self, company: Company) -> bool:
        for fb in company.feedback.all():
            if fb.form == "stage_4" and fb.status == "accepted":
                return True
        return False

    def skip_reason(self, company: Company, payload: dict) -> Optional[str]:
        if not self.stage4_accepted(company):
            return SKIP_NOT_ACCEPTED
        if not payload.get("description"):
            return SKIP_NO_DESCRIPTION
        if not payload.get("logo_media_path"):
            return SKIP_NO_LOGO
        return None


class CatalogueExportService:
    MAX_BATCH = 10

    def __init__(self, client: Optional[StrapiClient] = None):
        self.builder = CataloguePayloadBuilder()
        self._client = client
        self._taxonomy_cache: dict[str, dict[str, str]] = {}

    @property
    def client(self) -> StrapiClient:
        if self._client is None:
            self._client = StrapiClient()
        return self._client

    def _companies_qs(self, company_ids: list[int]):
        return (
            Company.objects.filter(id__in=company_ids)
            .select_related("description", "website_publication")
            .prefetch_related(
                "stand_all",
                Prefetch("jobwalls", queryset=Jobwall.objects.order_by("id")),
                Prefetch(
                    "feedback",
                    queryset=Feedback.objects.filter(form="stage_4"),
                ),
            )
        )

    def preview(self, company_ids: list[int]) -> dict:
        ordered_ids = list(dict.fromkeys(company_ids))
        by_id = {c.id: c for c in self._companies_qs(ordered_ids)}
        hall_map = self.builder.build_hall_map_payload()
        companies_out = []
        for cid in ordered_ids:
            company = by_id.get(cid)
            if not company:
                companies_out.append(
                    {
                        "company_id": cid,
                        "name": None,
                        "status": "missing",
                        "skip_reason": "company_not_found",
                        "changed_since_export": False,
                        "payload": None,
                    }
                )
                continue
            payload = self.builder.build_company_payload(company)
            skip = self.builder.skip_reason(company, payload)
            pub = getattr(company, "website_publication", None)
            current_job_keys = {str(job["id"]) for job in payload["jobs"]}
            jobs_removed = [
                info.get("title") or ""
                for key, info in ((pub.strapi_jobs if pub else None) or {}).items()
                if key not in current_job_keys
            ]
            digest = export_hash(payload, hall_map)
            changed = True
            if pub and pub.payload_hash and not pub.last_error:
                changed = pub.payload_hash != digest
            status = "skipped" if skip else ("unchanged" if not changed else "ready")
            companies_out.append(
                {
                    "company_id": company.id,
                    "name": company.name,
                    "status": status,
                    "skip_reason": skip,
                    "changed_since_export": bool(changed and not skip),
                    "last_exported_at": pub.last_exported_at.isoformat()
                    if pub and pub.last_exported_at
                    else None,
                    "last_error": (pub.last_error if pub else "") or "",
                    "jobs_removed": jobs_removed,
                    "payload": payload,
                }
            )
        return {
            "hall_map": hall_map,
            "companies": companies_out,
            "catalogue_url": "https://targipracy.org.pl/catalogue",
        }

    def export(self, company_ids: list[int]) -> dict:
        max_batch = getattr(settings, "WEBSITE_EXPORT_BATCH_MAX", self.MAX_BATCH)
        ordered_ids = list(dict.fromkeys(company_ids))
        if len(ordered_ids) > max_batch:
            raise ValueError(f"At most {max_batch} companies per request.")

        # Config check early
        try:
            client = self.client
        except StrapiConfigError as exc:
            raise StrapiConfigError(str(exc)) from exc

        preview = self.preview(ordered_ids)
        hall_map = preview["hall_map"]
        results = []

        for item in preview["companies"]:
            cid = item["company_id"]
            if item["status"] == "skipped" or item["status"] == "missing":
                results.append(
                    {
                        "company_id": cid,
                        "name": item.get("name"),
                        "ok": False,
                        "skipped": True,
                        "reason": item.get("skip_reason"),
                        "strapi_document_id": None,
                    }
                )
                continue
            if item["status"] == "unchanged":
                results.append(
                    {
                        "company_id": cid,
                        "name": item.get("name"),
                        "ok": True,
                        "skipped": True,
                        "reason": "unchanged",
                        "strapi_document_id": None,
                    }
                )
                continue

            try:
                doc_id = self._export_one(cid, item["payload"], hall_map, client)
                results.append(
                    {
                        "company_id": cid,
                        "name": item.get("name"),
                        "ok": True,
                        "skipped": False,
                        "reason": None,
                        "strapi_document_id": doc_id,
                    }
                )
            except (StrapiAPIError, OSError, ValueError) as exc:
                logger.exception("Catalogue export failed for company %s", cid)
                company = Company.objects.filter(id=cid).first()
                if company:
                    pub, _ = WebsitePublication.objects.get_or_create(company=company)
                    pub.last_error = str(exc)[:2000]
                    pub.save(update_fields=["last_error"])
                results.append(
                    {
                        "company_id": cid,
                        "name": item.get("name"),
                        "ok": False,
                        "skipped": False,
                        "reason": str(exc),
                        "strapi_document_id": None,
                    }
                )

        hall_map_ok = False
        hall_map_error = None
        # Also when every company is unchanged: the hall map draft should follow MapLayout.
        if any(r.get("ok") for r in results):
            try:
                client.upsert_hall_map_draft(hall_map["day1"], hall_map["day2"])
                hall_map_ok = True
            except StrapiAPIError as exc:
                hall_map_error = str(exc)
                logger.exception("Hall map draft upsert failed")

        return {
            "results": results,
            "hall_map": {"ok": hall_map_ok, "error": hall_map_error},
        }

    def _export_one(
        self,
        company_id: int,
        payload: dict,
        hall_map: dict,
        client: StrapiClient,
    ) -> str:
        company = (
            Company.objects.select_related("description", "website_publication")
            .prefetch_related("stand_all")
            .get(id=company_id)
        )
        pub, _ = WebsitePublication.objects.get_or_create(company=company)
        description = company.description
        if not description or not description.logo_file:
            raise ValueError("Catalogue logo file is required")

        logo_path = description.logo_file.path
        logo_digest = file_sha256(logo_path)
        old_logo_id = pub.strapi_logo_id
        uploaded_now = False
        if old_logo_id and pub.strapi_logo_sha256 == logo_digest:
            new_logo_id = old_logo_id
        else:
            uploaded = client.upload_file(logo_path)
            new_logo_id = uploaded.get("id")
            if not new_logo_id:
                raise StrapiAPIError("Strapi upload did not return media id")
            uploaded_now = True

        try:
            document_id = self._upsert_company_draft(
                pub, payload, new_logo_id, client
            )
        except Exception:
            if uploaded_now:
                self._safe_delete_media(client, new_logo_id, company_id)
            raise

        if old_logo_id and old_logo_id != new_logo_id:
            self._delete_logo_if_unpublished(
                client, document_id, old_logo_id, company_id
            )

        # Persist ids before syncing jobs so a retry updates instead of duplicating.
        pub.strapi_document_id = document_id
        pub.strapi_logo_id = new_logo_id
        pub.strapi_logo_sha256 = logo_digest
        pub.save(update_fields=["strapi_document_id", "strapi_logo_id", "strapi_logo_sha256"])

        self._sync_jobs(pub, document_id, payload.get("jobs") or [], client)

        pub.payload_hash = export_hash(payload, hall_map)
        pub.last_exported_at = timezone.now()
        pub.last_error = ""
        pub.save(update_fields=["payload_hash", "last_exported_at", "last_error"])
        return document_id

    def _taxonomy_ids(self, client: StrapiClient, collection: str) -> dict[str, str]:
        if collection not in self._taxonomy_cache:
            rows = client.list_documents(collection, fields=["internalName"])
            self._taxonomy_cache[collection] = {
                row.get("internalName"): row.get("documentId")
                for row in rows
                if row.get("internalName") and row.get("documentId")
            }
        return self._taxonomy_cache[collection]

    def _strapi_job_data(self, job: dict, company_document_id: str, client: StrapiClient) -> dict:
        data: dict[str, Any] = {
            "title": job["title"],
            "contact": job["contact"] or None,
            "description": {
                "outline": job["outline"],
                "benefits": job["benefits"],
                "requirements": job["requirements"],
            },
            "company": company_document_id,
        }
        for collection, (field, key) in JOB_TAXONOMIES.items():
            internal_name = job.get(key) or ""
            if not internal_name:
                data[field] = []
                continue
            document_id = self._taxonomy_ids(client, collection).get(internal_name)
            if not document_id:
                raise ValueError(
                    f"Website CMS has no {collection} entry '{internal_name}' "
                    f"(job '{job['title']}')"
                )
            data[field] = [document_id]
        return data

    def _sync_jobs(
        self,
        pub: WebsitePublication,
        company_document_id: str,
        jobs: list[dict],
        client: StrapiClient,
    ) -> None:
        synced: dict[str, dict] = dict(pub.strapi_jobs or {})

        def persist():
            pub.strapi_jobs = synced
            pub.save(update_fields=["strapi_jobs"])

        try:
            current_keys = set()
            for job in jobs:
                key = str(job["id"])
                current_keys.add(key)
                data = self._strapi_job_data(job, company_document_id, client)
                document_id = (synced.get(key) or {}).get("documentId") or ""
                if document_id:
                    try:
                        client.update_document_draft("jobs", document_id, data)
                    except StrapiAPIError as exc:
                        if exc.status_code != 404:
                            raise
                        document_id = ""
                if not document_id:
                    created = client.create_document_draft("jobs", data)
                    document_id = created.get("documentId") or ""
                    if not document_id:
                        raise StrapiAPIError("Strapi did not return job documentId")
                synced[key] = {"documentId": document_id, "title": job["title"]}
                persist()

            for key in [k for k in synced if k not in current_keys]:
                # Offer removed in the system: removing the document also takes it off the live site.
                client.delete_document("jobs", synced[key]["documentId"])
                synced.pop(key)
                persist()
        except Exception:
            persist()
            raise

    def _upsert_company_draft(
        self,
        pub: WebsitePublication,
        payload: dict,
        logo_id: int,
        client: StrapiClient,
    ) -> str:
        strapi_data = {
            "internalName": payload["internalName"],
            "externalName": payload["externalName"],
            "partnershipType": payload["partnershipType"],
            "description": payload["description"],
            "logo": logo_id,
            "stand": {
                "firstDay": payload["stand"]["firstDay"],
                "secondDay": payload["stand"]["secondDay"],
            },
        }

        document_id = pub.strapi_document_id
        if not document_id:
            existing = client.find_company_by_internal_name(payload["internalName"])
            if existing:
                document_id = existing.get("documentId") or ""

        if document_id:
            try:
                client.update_company_draft(document_id, strapi_data)
            except StrapiAPIError as exc:
                if exc.status_code != 404:
                    raise
                logger.warning(
                    "Strapi company %s missing (deleted in CMS?) — creating new draft",
                    document_id,
                )
                document_id = ""

        if not document_id:
            result = client.create_company_draft(strapi_data)
            document_id = result.get("documentId") or ""

        if not document_id:
            raise StrapiAPIError("Strapi did not return documentId")
        return document_id

    def _published_logo_id(self, client: StrapiClient, document_id: str) -> Optional[int]:
        published = client.get_company(document_id, status="published")
        logo = (published or {}).get("logo") or {}
        return logo.get("id")

    def _delete_logo_if_unpublished(
        self,
        client: StrapiClient,
        document_id: str,
        logo_id: int,
        company_id: int,
    ) -> None:
        # The live (published) version may still point at the previous logo until staff re-publishes.
        try:
            if self._published_logo_id(client, document_id) == logo_id:
                return
        except StrapiAPIError:
            logger.warning(
                "Could not check published logo for company %s; keeping media %s",
                company_id,
                logo_id,
                exc_info=True,
            )
            return
        self._safe_delete_media(client, logo_id, company_id)

    def _safe_delete_media(self, client: StrapiClient, media_id: int, company_id: int) -> None:
        try:
            client.delete_file(media_id)
        except StrapiAPIError:
            logger.warning(
                "Could not delete Strapi media %s for company %s",
                media_id,
                company_id,
                exc_info=True,
            )
