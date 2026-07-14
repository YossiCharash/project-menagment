"""API tests for the apartment personal area (אזור אישי) on the reception desk.

The personal area holds private details/notes and documents behind an admin
password. These tests exercise the full HTTP surface with the in-memory SQLite
fixtures, proving that:

  * a wrong password is rejected (403),
  * a Member desk operator can unlock it with an *admin's* password,
  * private details/notes round-trip through the update endpoint, and
  * documents can be uploaded (storage mocked), listed and deleted.
"""
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient

from backend.models.user import User, UserRole
from backend.core.security import hash_password

BASE = "/api/v1/building-reception"
IAM = "/api/v1/iam"
MANAGER_PASSWORD = "ManagerPW#9"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def manager_user(test_db) -> User:
    """A second admin with a *distinct* password, to prove the gate checks admins."""
    user = User(
        email="manager@test.com",
        password_hash=hash_password(MANAGER_PASSWORD),
        full_name="Building Manager",
        role=UserRole.ADMIN.value,
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


async def _create_apartment_for_member(
    client: AsyncClient, admin_token: str, member_id: int
) -> int:
    """Create a building/apartment as admin and grant the member desk access to it.

    The member is the desk operator: they hold read/write/update on the building's
    reception desk but are NOT an admin — so the personal area is reachable only
    once they supply the manager's admin password.
    """
    response = await client.post(
        f"{BASE}/buildings",
        headers=_auth(admin_token),
        json={
            "name": "בניין א",
            "floors_count": 1,
            "units_per_floor": 1,
            "has_common_areas": False,
            "first_unit_number": 1,
        },
    )
    assert response.status_code == 200, response.text
    building = response.json()

    grant = await client.post(
        f"{IAM}/users/{member_id}/building-reception",
        headers=_auth(admin_token),
        json={"building_id": building["id"], "actions": ["read", "write", "update"]},
    )
    assert grant.status_code == 201, grant.text
    return building["apartments"][0]["id"]


@pytest.mark.asyncio
@pytest.mark.api
class TestPersonalArea:
    async def test_wrong_password_is_rejected(
        self, test_client: AsyncClient, admin_token: str, member_token: str, member_user: User, manager_user: User
    ):
        apartment_id = await _create_apartment_for_member(test_client, admin_token, member_user.id)
        response = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={"password": "definitely-wrong"},
        )
        assert response.status_code == 403, response.text

    async def test_member_unlocks_with_admin_password(
        self, test_client: AsyncClient, admin_token: str, member_token: str, member_user: User, manager_user: User
    ):
        """A Member operating the desk unlocks the area with the manager's password."""
        apartment_id = await _create_apartment_for_member(test_client, admin_token, member_user.id)
        response = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={"password": MANAGER_PASSWORD},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["apartment_id"] == apartment_id
        assert body["private_details"] is None
        assert body["private_notes"] is None
        assert body["documents"] == []

    async def test_update_private_fields_round_trip(
        self, test_client: AsyncClient, admin_token: str, member_token: str, member_user: User, manager_user: User
    ):
        apartment_id = await _create_apartment_for_member(test_client, admin_token, member_user.id)
        update = await test_client.put(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={
                "password": MANAGER_PASSWORD,
                "private_details": "קוד כספת: 4821",
                "private_notes": "רגיש — לעיני המנהל בלבד",
            },
        )
        assert update.status_code == 200, update.text
        assert update.json()["private_details"] == "קוד כספת: 4821"

        # A fresh unlock reflects the persisted values.
        unlock = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={"password": MANAGER_PASSWORD},
        )
        assert unlock.status_code == 200
        assert unlock.json()["private_notes"] == "רגיש — לעיני המנהל בלבד"

    async def test_update_rejects_wrong_password(
        self, test_client: AsyncClient, admin_token: str, member_token: str, member_user: User, manager_user: User
    ):
        apartment_id = await _create_apartment_for_member(test_client, admin_token, member_user.id)
        response = await test_client.put(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={"password": "nope", "private_details": "x"},
        )
        assert response.status_code == 403, response.text

    async def test_document_upload_list_and_delete(
        self, test_client: AsyncClient, admin_token: str, member_token: str, member_user: User, manager_user: User
    ):
        apartment_id = await _create_apartment_for_member(test_client, admin_token, member_user.id)

        fake_s3 = MagicMock()
        fake_s3.upload_file.return_value = "https://bucket.example/doc.pdf"
        with patch(
            "backend.api.v1.endpoints.building_reception.S3Service", return_value=fake_s3
        ):
            upload = await test_client.post(
                f"{BASE}/apartments/{apartment_id}/personal-area/documents",
                headers=_auth(member_token),
                data={"password": MANAGER_PASSWORD, "description": "חוזה שכירות"},
                files={"file": ("contract.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
        assert upload.status_code == 200, upload.text
        doc = upload.json()
        assert doc["file_path"] == "https://bucket.example/doc.pdf"
        assert doc["description"] == "חוזה שכירות"
        document_id = doc["id"]

        # The document now shows up when unlocking.
        unlock = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={"password": MANAGER_PASSWORD},
        )
        assert len(unlock.json()["documents"]) == 1

        # Delete it (storage cleanup mocked out).
        with patch(
            "backend.api.v1.endpoints.building_reception.S3Service", return_value=fake_s3
        ):
            delete = await test_client.request(
                "DELETE",
                f"{BASE}/apartments/{apartment_id}/personal-area/documents/{document_id}",
                headers=_auth(member_token),
                json={"password": MANAGER_PASSWORD},
            )
        assert delete.status_code == 204, delete.text

        unlock_after = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/personal-area",
            headers=_auth(member_token),
            json={"password": MANAGER_PASSWORD},
        )
        assert unlock_after.json()["documents"] == []

    async def test_upload_rejects_wrong_password(
        self, test_client: AsyncClient, admin_token: str, member_token: str, member_user: User, manager_user: User
    ):
        apartment_id = await _create_apartment_for_member(test_client, admin_token, member_user.id)
        upload = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/personal-area/documents",
            headers=_auth(member_token),
            data={"password": "wrong"},
            files={"file": ("contract.pdf", b"data", "application/pdf")},
        )
        assert upload.status_code == 403, upload.text
