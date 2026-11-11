import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.core.files.base import ContentFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

from companies.models import (
    STATUS_BASIC,
    STATUS_MAIN,
    STATUS_PARTENER,
    Company,
    Description,
    Feedback,
    Form,
    Jobwall,
    Settings,
    Stand,
    WebsitePublication,
)
from companies.services.catalogue_export_service import (
    CatalogueExportService,
    export_hash,
    internal_name_for_company,
    partnership_type_for_strapi,
    stand_label,
    payload_hash,
)
from companies.services.strapi_client import StrapiAPIError, StrapiClient

# 1x1 RGB PNG
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
    "de0000000c4944415408d763f8cfc000000301010018dd8db40000000049454e44ae426082"
)


class PartnershipMappingTests(SimpleTestCase):
    def test_status_mapping(self):
        self.assertEqual(partnership_type_for_strapi(STATUS_MAIN), "main")
        self.assertEqual(partnership_type_for_strapi(STATUS_PARTENER), "partner")
        self.assertEqual(partnership_type_for_strapi(STATUS_BASIC), "regular")

    def test_stand_label_skips_brak(self):
        self.assertEqual(stand_label(None), "")
        self.assertEqual(stand_label(Stand(stand_number="brak")), "")
        self.assertEqual(stand_label(Stand(stand_number="C1")), "C1")

    def test_payload_hash_stable(self):
        a = payload_hash({"b": 1, "a": 2})
        b = payload_hash({"a": 2, "b": 1})
        self.assertEqual(a, b)

    def test_export_hash_includes_logo_sha(self):
        payload = {"logo_media_path": "same/path.png"}
        hall = {"day1": {}, "day2": {}}
        self.assertNotEqual(
            export_hash(payload, hall, logo_sha256="aaa"),
            export_hash(payload, hall, logo_sha256="bbb"),
        )

    def test_internal_name_is_edition_scoped(self):
        self.assertEqual(internal_name_for_company(7, 33), "itp33-7")
        self.assertNotEqual(
            internal_name_for_company(7, 33), internal_name_for_company(7, 34)
        )


class CataloguePreviewApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user(
            username="staff_export",
            password="pass",
            type="staff",
            staff_roles=["fr"],
        )
        self.company = Company.objects.create(
            name="Export Co",
            email="export@example.com",
            status=STATUS_BASIC,
        )
        Form.objects.create(company=self.company)
        Description.objects.create(
            company=self.company,
            descr="Opis katalogowy",
        )
        Feedback.objects.create(
            company=self.company,
            form="stage_4",
            status="accepted",
        )

    def test_preview_requires_auth(self):
        response = self.client.get(
            "/api/website-export/catalogue/preview/",
            {"company_ids": self.company.id},
        )
        self.assertIn(response.status_code, (401, 403))

    def test_preview_marks_missing_logo(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            "/api/website-export/catalogue/preview/",
            {"company_ids": self.company.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["companies"][0]
        self.assertEqual(row["status"], "skipped")
        self.assertEqual(row["skip_reason"], "missing_catalogue_logo")

    @override_settings(STRAPI_URL="", STRAPI_API_TOKEN="")
    def test_export_without_config_returns_503(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            "/api/website-export/catalogue/",
            {"company_ids": [self.company.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


class StrapiUploadClientTests(SimpleTestCase):
    @override_settings(
        STRAPI_URL="http://strapi.test",
        STRAPI_API_TOKEN="token",
    )
    @patch("companies.services.strapi_client.requests.request")
    def test_upload_sends_explicit_mime_type(self, mock_request):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 201
        mock_response.content = b'[{"id":1}]'
        mock_response.json.return_value = [{"id": 1, "name": "logo.png"}]
        mock_request.return_value = mock_response

        handle = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        handle.write(PNG_BYTES)
        handle.close()
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))

        result = StrapiClient().upload_file(handle.name, filename="logo.png")
        self.assertEqual(result["id"], 1)
        kwargs = mock_request.call_args.kwargs
        files = kwargs["files"]["files"]
        self.assertEqual(files[0], "logo.png")
        self.assertEqual(files[2], "image/png")
        self.assertNotIn("json", kwargs)

    @override_settings(
        STRAPI_URL="http://strapi.test",
        STRAPI_API_TOKEN="token",
    )
    @patch("companies.services.strapi_client.requests.request")
    def test_create_document_omits_status_when_publishing(self, mock_request):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 201
        mock_response.content = b'{"data":{"documentId":"x"}}'
        mock_response.json.return_value = {"data": {"documentId": "x"}}
        mock_request.return_value = mock_response

        StrapiClient().create_document("companies", {"externalName": "A"}, publish=True)
        self.assertIsNone(mock_request.call_args.kwargs.get("params"))

        StrapiClient().create_document("companies", {"externalName": "B"}, publish=False)
        self.assertEqual(
            mock_request.call_args.kwargs.get("params"), {"status": "draft"}
        )

    @override_settings(
        STRAPI_URL="http://strapi.test",
        STRAPI_API_TOKEN="token",
    )
    @patch("companies.services.strapi_client.requests.request")
    def test_list_documents_requests_published(self, mock_request):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.content = b'{"data":[],"meta":{"pagination":{"pageCount":1}}}'
        mock_response.json.return_value = {
            "data": [],
            "meta": {"pagination": {"pageCount": 1}},
        }
        mock_request.return_value = mock_response

        StrapiClient().list_documents("work-models", fields=["internalName"])
        params = mock_request.call_args.kwargs.get("params") or {}
        self.assertEqual(params.get("status"), "published")

    @override_settings(
        STRAPI_URL="http://strapi.test",
        STRAPI_API_TOKEN="token",
    )
    @patch("companies.services.strapi_client.requests.request")
    def test_find_company_falls_back_to_published(self, mock_request):
        draft_empty = MagicMock()
        draft_empty.ok = True
        draft_empty.status_code = 200
        draft_empty.content = b'{"data":[]}'
        draft_empty.json.return_value = {"data": []}

        published_hit = MagicMock()
        published_hit.ok = True
        published_hit.status_code = 200
        published_hit.content = b'{"data":[{"documentId":"pub-1"}]}'
        published_hit.json.return_value = {"data": [{"documentId": "pub-1"}]}
        mock_request.side_effect = [draft_empty, published_hit]

        found = StrapiClient().find_company_by_internal_name("itp33-1")
        self.assertEqual(found["documentId"], "pub-1")
        self.assertEqual(mock_request.call_count, 2)
        self.assertEqual(
            mock_request.call_args_list[0].kwargs["params"]["status"], "draft"
        )
        self.assertEqual(
            mock_request.call_args_list[1].kwargs["params"]["status"], "published"
        )


class CatalogueExportServiceTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        media_override = override_settings(MEDIA_ROOT=self.media_root)
        media_override.enable()
        self.addCleanup(media_override.disable)

        settings_obj = Settings.get_settings()
        settings_obj.edition_number = 33
        settings_obj.save()

        self.company = Company.objects.create(
            name="Service Export Co",
            email="service@example.com",
            status=STATUS_PARTENER,
        )
        Form.objects.create(company=self.company)
        self.description = Description(company=self.company, descr="Opis")
        self.description.logo_file.save("logo.png", ContentFile(PNG_BYTES), save=True)
        Feedback.objects.create(company=self.company, form="stage_4", status="accepted")
        Stand.objects.create(company=self.company, day="day1", stand_number="C1")

        self.client = MagicMock()
        self.client.upload_file.side_effect = [{"id": 10}, {"id": 11}, {"id": 12}]
        self.client.find_company_by_internal_name.return_value = None
        self.client.create_company.return_value = {"documentId": "doc-1"}
        self.client.update_company.return_value = {"documentId": "doc-1"}
        self.client.get_company.return_value = None
        self.taxonomy = {
            "work-models": [
                {"internalName": key, "documentId": f"wm-{key}"}
                for key in ("on-site", "remote", "hybrid", "contest", "mobile")
            ],
            "employment-types": [
                {"internalName": key, "documentId": f"et-{key}"}
                for key in ("1", "1/2", "3/4", "flex")
            ],
            "contracts": [
                {"internalName": key, "documentId": f"ct-{key}"}
                for key in ("UoP", "UoZ", "UoD", "B2B", "internship")
            ],
        }
        self.client.list_documents.side_effect = (
            lambda collection, fields=None: self.taxonomy[collection]
        )
        self.client.create_document.side_effect = (
            {"documentId": f"job-{n}"} for n in range(1, 100)
        )
        self.service = CatalogueExportService(client=self.client)

    def _export(self):
        return self.service.export([self.company.id])["results"][0]

    def _replace_logo(self):
        self.description.logo_file.save(
            "logo2.png", ContentFile(PNG_BYTES + b"\x00"), save=True
        )

    def test_first_export_publishes_company_with_edition_name(self):
        row = self._export()
        self.assertTrue(row["ok"])
        data = self.client.create_company.call_args.args[0]
        self.assertEqual(data["internalName"], f"itp33-{self.company.id}")
        self.assertEqual(data["partnershipType"], "partner")
        self.assertEqual(data["logo"], 10)
        self.assertEqual(data["stand"]["firstDay"], "C1")
        self.assertTrue(self.client.create_company.call_args.kwargs.get("publish"))
        self.client.upsert_hall_map_draft.assert_called_once()
        self.assertTrue(
            self.client.upsert_hall_map_draft.call_args.kwargs.get("publish")
        )

    def test_export_can_leave_content_as_draft(self):
        payload = self.service.export([self.company.id], publish_content=False)
        self.assertTrue(payload["results"][0]["ok"])
        self.assertFalse(self.client.create_company.call_args.kwargs.get("publish"))

    def test_export_can_leave_hall_map_as_draft(self):
        payload = self.service.export(
            [self.company.id], publish_hall_map=False
        )
        self.assertTrue(payload["results"][0]["ok"])
        self.assertTrue(payload["hall_map"]["ok"])
        self.assertFalse(payload["hall_map"]["published"])
        self.assertFalse(
            self.client.upsert_hall_map_draft.call_args.kwargs.get("publish")
        )

    def test_unchanged_logo_is_reused_not_reuploaded(self):
        self._export()
        self.description.descr = "Opis v2"
        self.description.save()
        row = self._export()
        self.assertTrue(row["ok"])
        self.assertEqual(self.client.upload_file.call_count, 1)
        data = self.client.update_company.call_args.args[1]
        self.assertEqual(data["logo"], 10)
        self.client.delete_file.assert_not_called()

    def test_logo_still_published_is_not_deleted(self):
        self._export()
        self.client.get_company.return_value = {"logo": {"id": 10}}
        self._replace_logo()
        self._export()
        self.client.delete_file.assert_not_called()
        pub = WebsitePublication.objects.get(company=self.company)
        self.assertEqual(pub.strapi_logo_id, 11)

    def test_unpublished_old_logo_is_deleted(self):
        self._export()
        self.client.get_company.return_value = None
        self._replace_logo()
        self._export()
        self.client.delete_file.assert_called_once_with(10)

    def test_missing_strapi_document_is_recreated(self):
        self._export()
        self.description.descr = "Opis v3"
        self.description.save()
        self.client.update_company.side_effect = StrapiAPIError(
            "gone", status_code=404
        )
        self.client.create_company.return_value = {"documentId": "doc-2"}
        row = self._export()
        self.assertTrue(row["ok"])
        self.assertEqual(row["strapi_document_id"], "doc-2")

    def _add_job(self, **overrides):
        data = {
            "company": self.company,
            "name": "Junior Engineer",
            "form": "s",
            "workload": "pol",
            "contract": "uop",
            "description": "Opis",
            "benefits": "Benefity",
            "requirements": "Wymagania",
            "url": " rekrutacja@example.com ",
        }
        data.update(overrides)
        return Jobwall.objects.create(**data)

    def test_preview_jobs_use_website_labels(self):
        first = self._add_job()
        second = self._add_job(name="Second", form="m", workload="pelen", contract="b2b")
        payload = self.service.preview([self.company.id])["companies"][0]["payload"]
        self.assertEqual([j["id"] for j in payload["jobs"]], [first.id, second.id])
        job, other = payload["jobs"]
        self.assertEqual(job["workModel"], "stacjonarnie")
        self.assertEqual(job["employmentType"], "1/2 etatu")
        self.assertEqual(job["contract"], "umowa o pracę")
        self.assertEqual(job["contact"], "rekrutacja@example.com")
        self.assertEqual(other["workModel"], "mobilna")
        self.assertEqual(other["contract"], "B2B")

    def test_job_change_marks_company_ready(self):
        self._export()
        self._add_job()
        row = self.service.preview([self.company.id])["companies"][0]
        self.assertEqual(row["status"], "ready")

    def test_jobs_are_exported_with_taxonomy_relations(self):
        job = self._add_job()
        row = self._export()
        self.assertTrue(row["ok"])
        collection, data = self.client.create_document.call_args.args
        self.assertEqual(collection, "jobs")
        self.assertEqual(data["company"], "doc-1")
        self.assertEqual(data["workModels"], ["wm-on-site"])
        self.assertEqual(data["employmentTypes"], ["et-1/2"])
        self.assertEqual(data["contracts"], ["ct-UoP"])
        self.assertEqual(data["contact"], "rekrutacja@example.com")
        self.assertEqual(data["description"]["benefits"], "Benefity")
        self.assertTrue(self.client.create_document.call_args.kwargs.get("publish"))
        pub = WebsitePublication.objects.get(company=self.company)
        self.assertEqual(pub.strapi_jobs[str(job.id)]["documentId"], "job-1")

    def test_changed_job_updates_same_document(self):
        job = self._add_job()
        self._export()
        job.benefits = "Nowe benefity"
        job.save()
        row = self._export()
        self.assertTrue(row["ok"])
        self.assertEqual(self.client.create_document.call_count, 1)
        collection, document_id, data = self.client.update_document.call_args.args
        self.assertEqual((collection, document_id), ("jobs", "job-1"))
        self.assertEqual(data["description"]["benefits"], "Nowe benefity")
        self.assertTrue(self.client.update_document.call_args.kwargs.get("publish"))

    def test_removed_job_is_announced_and_deleted(self):
        keep = self._add_job()
        gone = self._add_job(name="Stara oferta")
        self._export()
        gone.delete()
        row = self.service.preview([self.company.id])["companies"][0]
        self.assertEqual(row["jobs_removed"], ["Stara oferta"])
        self._export()
        self.client.delete_document.assert_called_once_with("jobs", "job-2")
        pub = WebsitePublication.objects.get(company=self.company)
        self.assertEqual(list(pub.strapi_jobs), [str(keep.id)])

    def test_missing_taxonomy_fails_but_keeps_company_and_stays_ready(self):
        self._add_job(contract="b2b")
        rows = dict(self.taxonomy)
        rows["contracts"] = []
        self.client.list_documents.side_effect = lambda collection, fields=None: rows[collection]
        row = self._export()
        self.assertFalse(row["ok"])
        pub = WebsitePublication.objects.get(company=self.company)
        self.assertEqual(pub.strapi_document_id, "doc-1")
        self.assertIn("B2B", pub.last_error)
        status = self.service.preview([self.company.id])["companies"][0]["status"]
        self.assertEqual(status, "ready")
        self.client.create_company.reset_mock()
        self.client.list_documents.side_effect = (
            lambda collection, fields=None: self.taxonomy[collection]
        )
        self.service = CatalogueExportService(client=self.client)
        self.assertTrue(self._export()["ok"])
        self.client.create_company.assert_not_called()

    def test_failed_draft_write_removes_fresh_upload(self):
        self.client.create_company.side_effect = StrapiAPIError(
            "bad", status_code=400
        )
        row = self._export()
        self.assertFalse(row["ok"])
        self.client.delete_file.assert_called_once_with(10)
        pub = WebsitePublication.objects.get(company=self.company)
        self.assertIn("bad", pub.last_error)

    def test_preview_can_remove_when_exported(self):
        preview = self.service.preview([self.company.id])["companies"][0]
        self.assertFalse(preview["can_remove"])
        self._export()
        preview = self.service.preview([self.company.id])["companies"][0]
        self.assertTrue(preview["can_remove"])

    def test_remove_deletes_jobs_company_and_clears_tracking(self):
        job = self._add_job()
        self._export()
        pub = WebsitePublication.objects.get(company=self.company)
        self.assertEqual(pub.strapi_document_id, "doc-1")
        self.assertIn(str(job.id), pub.strapi_jobs)

        row = self.service.remove([self.company.id])["results"][0]
        self.assertTrue(row["ok"])
        self.client.delete_document.assert_any_call("jobs", "job-1")
        self.client.delete_document.assert_any_call("companies", "doc-1")
        self.client.delete_file.assert_called_with(10)

        pub.refresh_from_db()
        self.assertEqual(pub.strapi_document_id, "")
        self.assertIsNone(pub.strapi_logo_id)
        self.assertEqual(pub.strapi_jobs, {})
        self.assertEqual(pub.payload_hash, "")
        self.assertIsNone(pub.last_exported_at)
        self.assertEqual(pub.last_error, "")

    def test_remove_without_tracking_is_skipped(self):
        row = self.service.remove([self.company.id])["results"][0]
        self.assertTrue(row["skipped"])
        self.assertEqual(row["reason"], "not_exported")
        self.client.delete_document.assert_not_called()

    def test_remove_keeps_tracking_when_company_delete_fails(self):
        job = self._add_job()
        self._export()
        pub = WebsitePublication.objects.get(company=self.company)
        jobs_before = dict(pub.strapi_jobs)
        document_before = pub.strapi_document_id

        def delete_side_effect(collection, document_id):
            if collection == "companies":
                raise StrapiAPIError("company delete failed", status_code=500)

        self.client.delete_document.side_effect = delete_side_effect
        row = self.service.remove([self.company.id])["results"][0]
        self.assertFalse(row["ok"])
        pub.refresh_from_db()
        self.assertEqual(pub.strapi_document_id, document_before)
        self.assertEqual(pub.strapi_jobs, jobs_before)
        self.assertIn(str(job.id), pub.strapi_jobs)

    def test_preview_detects_logo_bytes_change_at_same_path(self):
        self._export()
        preview = self.service.preview([self.company.id])["companies"][0]
        self.assertEqual(preview["status"], "unchanged")
        path = self.description.logo_file.path
        with open(path, "wb") as handle:
            handle.write(PNG_BYTES + b"\x01")
        preview = self.service.preview([self.company.id])["companies"][0]
        self.assertEqual(preview["status"], "ready")

    def test_whitespace_description_is_skipped(self):
        self.description.descr = "   \n\t  "
        self.description.save()
        preview = self.service.preview([self.company.id])["companies"][0]
        self.assertEqual(preview["status"], "skipped")
        self.assertEqual(preview["skip_reason"], "missing_catalogue_description")

    def test_removed_job_with_broken_tracking_does_not_crash(self):
        job = self._add_job()
        self._export()
        pub = WebsitePublication.objects.get(company=self.company)
        broken = dict(pub.strapi_jobs)
        broken["99999"] = {}
        pub.strapi_jobs = broken
        pub.payload_hash = ""
        pub.save(update_fields=["strapi_jobs", "payload_hash"])
        job.delete()
        row = self._export()
        self.assertTrue(row["ok"])
        pub.refresh_from_db()
        self.assertNotIn("99999", pub.strapi_jobs)
