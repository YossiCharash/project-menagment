"""API tests for apartment documents (מסמכי דירה).

Exercise the full HTTP surface for attaching, listing and removing documents on
an apartment, plus the cascade-purge when the apartment itself is deleted. S3 is
replaced with an in-memory fake so no AWS configuration is required.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.models.document import Document

BASE = "/api/v1/building-reception"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class _FakeS3Service:
    """Records uploads/deletes instead of talking to AWS."""

    uploaded: list[tuple[str, str | None]] = []
    deleted: list[str] = []

    def upload_file(self, *, prefix, file_obj, filename=None, content_type=None):
        _FakeS3Service.uploaded.append((prefix, filename))
        return f"https://bucket.s3.amazonaws.com/{prefix}/{filename}"

    def delete_file(self, file_url):
        _FakeS3Service.deleted.append(file_url)


@pytest.fixture(autouse=True)
def fake_s3(monkeypatch):
    """Swap the real S3Service used by the apartment-document service."""
    _FakeS3Service.uploaded = []
    _FakeS3Service.deleted = []
    monkeypatch.setattr(
        "backend.services.apartment_document_service.S3Service", _FakeS3Service
    )
    return _FakeS3Service


async def _create_building(client: AsyncClient, token: str) -> dict:
    response = await client.post(
        f"{BASE}/buildings",
        headers=_auth(token),
        json={
            "name": "בניין מסמכים",
            "address": "רחוב הבדיקה 1",
            "compound_name": "מתחם",
            "floors_count": 1,
            "units_per_floor": 2,
            "has_common_areas": False,
            "first_unit_number": 1,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _first_apartment_id(building: dict) -> int:
    return building["apartments"][0]["id"]


async def _upload(client: AsyncClient, token: str, apartment_id: int, description: str) -> dict:
    response = await client.post(
        f"{BASE}/apartments/{apartment_id}/documents",
        headers=_auth(token),
        files={"file": ("contract.pdf", b"%PDF-1.4 fake", "application/pdf")},
        data={"description": description},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
@pytest.mark.api
class TestApartmentDocuments:
    async def test_upload_stores_description_and_returns_dto(
        self, test_client: AsyncClient, admin_token: str, fake_s3
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)

        doc = await _upload(test_client, admin_token, apartment_id, "חוזה שכירות")

        assert doc["apartment_id"] == apartment_id
        assert doc["description"] == "חוזה שכירות"
        assert doc["file_name"] == "contract.pdf"
        assert "amazonaws.com" in doc["file_path"]
        # The file went through S3 under an apartment-scoped prefix.
        assert fake_s3.uploaded and fake_s3.uploaded[0][0] == f"apartments/{apartment_id}/documents"

    async def test_upload_without_description_keeps_original_filename(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)

        response = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/documents",
            headers=_auth(admin_token),
            files={"file": ("floor-plan.png", b"fake-image", "image/png")},
        )
        assert response.status_code == 200, response.text
        doc = response.json()
        # No description was given, so the original filename is what the UI shows.
        assert doc["description"] is None
        assert doc["file_name"] == "floor-plan.png"

    async def test_document_appears_on_apartment_detail(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        await _upload(test_client, admin_token, apartment_id, "תעודת זהות")

        response = await test_client.get(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
        )
        assert response.status_code == 200, response.text
        documents = response.json()["documents"]
        assert len(documents) == 1
        assert documents[0]["description"] == "תעודת זהות"

    async def test_list_endpoint_returns_documents(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        await _upload(test_client, admin_token, apartment_id, "מסמך א")
        await _upload(test_client, admin_token, apartment_id, "מסמך ב")

        response = await test_client.get(
            f"{BASE}/apartments/{apartment_id}/documents", headers=_auth(admin_token)
        )
        assert response.status_code == 200, response.text
        assert len(response.json()) == 2

    async def test_delete_removes_document_and_s3_file(
        self, test_client: AsyncClient, admin_token: str, fake_s3
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        doc = await _upload(test_client, admin_token, apartment_id, "למחיקה")

        response = await test_client.delete(
            f"{BASE}/apartments/{apartment_id}/documents/{doc['id']}",
            headers=_auth(admin_token),
        )
        assert response.status_code == 204, response.text
        assert doc["file_path"] in fake_s3.deleted

        detail = await test_client.get(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
        )
        assert detail.json()["documents"] == []

    async def test_delete_document_of_other_apartment_is_404(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = building["apartments"][0]["id"]
        other_apartment_id = building["apartments"][1]["id"]
        doc = await _upload(test_client, admin_token, apartment_id, "שייך לדירה אחרת")

        response = await test_client.delete(
            f"{BASE}/apartments/{other_apartment_id}/documents/{doc['id']}",
            headers=_auth(admin_token),
        )
        assert response.status_code == 404, response.text

    async def test_deleting_apartment_purges_its_documents(
        self, test_client: AsyncClient, admin_token: str, test_db, fake_s3
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        await _upload(test_client, admin_token, apartment_id, "יימחק עם הדירה")

        response = await test_client.delete(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
        )
        assert response.status_code == 204, response.text

        remaining = await test_db.execute(
            select(Document).where(
                Document.entity_type == "apartment",
                Document.entity_id == apartment_id,
            )
        )
        assert remaining.scalars().all() == []
        assert len(fake_s3.deleted) == 1
