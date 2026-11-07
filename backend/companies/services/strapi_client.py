"""HTTP client for Strapi 5 Document REST API (targus)."""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path
from typing import Any, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class StrapiConfigError(Exception):
    """Missing STRAPI_URL / STRAPI_API_TOKEN."""


class StrapiAPIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class StrapiClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        connect_timeout: Optional[float] = None,
        read_timeout: Optional[float] = None,
    ):
        self.base_url = (base_url if base_url is not None else settings.STRAPI_URL).rstrip("/")
        self.token = token if token is not None else settings.STRAPI_API_TOKEN
        self.connect_timeout = (
            connect_timeout
            if connect_timeout is not None
            else getattr(settings, "STRAPI_CONNECT_TIMEOUT", 10.0)
        )
        self.read_timeout = (
            read_timeout
            if read_timeout is not None
            else getattr(settings, "STRAPI_READ_TIMEOUT", 60.0)
        )
        if not self.base_url or not self.token:
            raise StrapiConfigError(
                "STRAPI_URL and STRAPI_API_TOKEN must be set to export to the website."
            )

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def _timeout(self) -> tuple[float, float]:
        return (self.connect_timeout, self.read_timeout)

    def _raise_for_response(self, response: requests.Response, action: str) -> None:
        if response.ok:
            return
        try:
            payload = response.json()
        except Exception:
            payload = response.text
        message = f"Strapi {action} failed ({response.status_code})"
        if isinstance(payload, dict):
            err = payload.get("error") or {}
            if isinstance(err, dict) and err.get("message"):
                message = f"{message}: {err['message']}"
        raise StrapiAPIError(message, status_code=response.status_code, details=payload)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: Optional[dict] = None,
        files: Any = None,
        action: str = "request",
    ) -> Any:
        url = f"{self.base_url}{path}"
        headers = self._headers()
        try:
            if files is not None:
                # Multipart: never send json=; optional extra form fields via data=
                kwargs: dict[str, Any] = {
                    "headers": headers,
                    "params": params,
                    "files": files,
                    "timeout": self._timeout(),
                }
                if json_body is not None:
                    kwargs["data"] = json_body
                response = requests.request(method, url, **kwargs)
            else:
                response = requests.request(
                    method,
                    url,
                    headers=headers,
                    params=params,
                    json=json_body,
                    timeout=self._timeout(),
                )
        except requests.Timeout as exc:
            raise StrapiAPIError(f"Strapi {action} timed out") from exc
        except requests.RequestException as exc:
            raise StrapiAPIError(f"Strapi {action} network error: {exc}") from exc
        self._raise_for_response(response, action)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    def find_company_by_internal_name(self, internal_name: str) -> Optional[dict]:
        data = self._request(
            "GET",
            "/api/companies",
            params={
                "status": "draft",
                "filters[internalName][$eq]": internal_name,
                "pagination[pageSize]": 1,
            },
            action="find company",
        )
        rows = (data or {}).get("data") or []
        return rows[0] if rows else None

    def get_company(self, document_id: str, status: str = "draft") -> Optional[dict]:
        try:
            data = self._request(
                "GET",
                f"/api/companies/{document_id}",
                params={"status": status, "populate": "logo"},
                action="get company",
            )
        except StrapiAPIError as exc:
            if exc.status_code == 404:
                return None
            raise
        return (data or {}).get("data")

    def list_documents(self, collection: str, fields: Optional[list[str]] = None) -> list[dict]:
        """All published documents of a collection (taxonomies are small)."""
        rows: list[dict] = []
        page = 1
        while True:
            params: dict[str, Any] = {
                "pagination[page]": page,
                "pagination[pageSize]": 100,
            }
            for index, field in enumerate(fields or []):
                params[f"fields[{index}]"] = field
            data = self._request(
                "GET", f"/api/{collection}", params=params, action=f"list {collection}"
            ) or {}
            rows.extend(data.get("data") or [])
            page_count = ((data.get("meta") or {}).get("pagination") or {}).get("pageCount") or 1
            if page >= page_count:
                return rows
            page += 1

    def create_document_draft(self, collection: str, data: dict) -> dict:
        result = self._request(
            "POST",
            f"/api/{collection}",
            params={"status": "draft"},
            json_body={"data": data},
            action=f"create {collection} draft",
        )
        return result["data"]

    def update_document_draft(self, collection: str, document_id: str, data: dict) -> dict:
        result = self._request(
            "PUT",
            f"/api/{collection}/{document_id}",
            params={"status": "draft"},
            json_body={"data": data},
            action=f"update {collection} draft",
        )
        return result["data"]

    def delete_document(self, collection: str, document_id: str) -> None:
        try:
            self._request(
                "DELETE",
                f"/api/{collection}/{document_id}",
                action=f"delete {collection}",
            )
        except StrapiAPIError as exc:
            if exc.status_code == 404:
                logger.warning("Strapi %s %s already missing", collection, document_id)
                return
            raise

    def create_company_draft(self, data: dict) -> dict:
        return self.create_document_draft("companies", data)

    def update_company_draft(self, document_id: str, data: dict) -> dict:
        return self.update_document_draft("companies", document_id, data)

    def upsert_hall_map_draft(self, day1: dict, day2: dict) -> dict:
        result = self._request(
            "PUT",
            "/api/hall-map",
            params={"status": "draft"},
            json_body={"data": {"day1": day1, "day2": day2}},
            action="upsert hall-map draft",
        )
        return (result or {}).get("data") or {}

    def upload_file(self, file_path: str | Path, filename: Optional[str] = None) -> dict:
        path = Path(file_path)
        name = filename or path.name
        # Strapi rejects multipart parts without an explicit MIME type ("Files are empty").
        mime, _ = mimetypes.guess_type(name)
        content_type = mime or "application/octet-stream"
        content = path.read_bytes()
        if not content:
            raise StrapiAPIError(f"Local media file is empty: {name}")
        result = self._request(
            "POST",
            "/api/upload",
            files={"files": (name, content, content_type)},
            action="upload file",
        )
        if not result:
            raise StrapiAPIError("Strapi upload returned empty response")
        # Upload API returns a list
        if isinstance(result, list):
            return result[0]
        return result

    def delete_file(self, file_id: int) -> None:
        try:
            self._request(
                "DELETE",
                f"/api/upload/files/{file_id}",
                action="delete file",
            )
        except StrapiAPIError as exc:
            # Missing media should not fail the whole export
            if exc.status_code == 404:
                logger.warning("Strapi media %s already missing", file_id)
                return
            raise
