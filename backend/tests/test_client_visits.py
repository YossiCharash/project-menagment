"""API tests for client arrivals (הגעות לקוחות) at the Building Reception Desk.

Exercises the full HTTP surface (endpoint + service + repository) using the
in-memory fixtures from ``conftest.py``, mirroring ``test_building_reception``.
Focus: arrival is required / until is optional, immediate exit, visit-driven
occupancy, and the auto-vacancy reconcile that fires when ``expected_until``
has already passed.
"""
import pytest
from httpx import AsyncClient

BASE = "/api/v1/building-reception"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_building(client: AsyncClient, token: str) -> dict:
    response = await client.post(
        f"{BASE}/buildings",
        headers=_auth(token),
        json={
            "name": "בניין לקוחות",
            "address": "רחוב הבדיקה 1",
            "compound_name": "מתחם בדיקה",
            "floors_count": 1,
            "units_per_floor": 1,
            "has_common_areas": False,
            "first_unit_number": 1,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _first_apartment_id(building: dict) -> int:
    for apartment in building["apartments"]:
        if not apartment["is_common_area"]:
            return apartment["id"]
    raise AssertionError("no residential apartment in building")


async def _apartment_detail(client: AsyncClient, token: str, apartment_id: int) -> dict:
    response = await client.get(f"{BASE}/apartments/{apartment_id}", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _overview_apartment(client: AsyncClient, token: str, building_id: int, apartment_id: int) -> dict:
    response = await client.get(f"{BASE}/buildings/{building_id}", headers=_auth(token))
    assert response.status_code == 200, response.text
    return next(a for a in response.json()["apartments"] if a["id"] == apartment_id)


@pytest.mark.asyncio
@pytest.mark.api
class TestClientVisits:
    async def test_create_arrival_marks_apartment_occupied(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)

        created = await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={
                "apartment_id": apartment_id,
                "name": "ישראל ישראלי",
                "arrived_at": "2026-07-13T09:00:00Z",
                "expected_until": "2030-01-01T00:00:00Z",
            },
        )
        assert created.status_code == 200, created.text
        assert created.json()["status"] == "present"

        detail = await _apartment_detail(test_client, admin_token, apartment_id)
        assert len(detail["client_visits"]) == 1
        assert detail["client_visits"][0]["name"] == "ישראל ישראלי"

        overview = await _overview_apartment(test_client, admin_token, building["id"], apartment_id)
        assert overview["has_active_client_visit"] is True

    async def test_arrival_time_is_required(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)

        response = await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "name": "ללא זמן"},
        )
        assert response.status_code == 422, response.text

    async def test_until_is_optional(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)

        response = await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "arrived_at": "2026-07-13T09:00:00Z"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["expected_until"] is None

    async def test_immediate_exit_frees_apartment(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        created = await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "arrived_at": "2026-07-13T09:00:00Z"},
        )
        visit_id = created.json()["id"]

        exited = await test_client.post(
            f"{BASE}/client-visits/{visit_id}/exit", headers=_auth(admin_token)
        )
        assert exited.status_code == 200, exited.text
        assert exited.json()["status"] == "left"
        assert exited.json()["left_at"] is not None

        overview = await _overview_apartment(test_client, admin_token, building["id"], apartment_id)
        assert overview["has_active_client_visit"] is False

    async def test_exit_twice_is_rejected(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        created = await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "arrived_at": "2026-07-13T09:00:00Z"},
        )
        visit_id = created.json()["id"]
        await test_client.post(f"{BASE}/client-visits/{visit_id}/exit", headers=_auth(admin_token))

        again = await test_client.post(
            f"{BASE}/client-visits/{visit_id}/exit", headers=_auth(admin_token)
        )
        assert again.status_code == 400, again.text

    async def test_past_until_auto_expires_on_read(
        self, test_client: AsyncClient, admin_token: str
    ):
        """A visit whose ``expected_until`` already passed is auto-flipped to
        ``left`` on the next read, turning the apartment vacant (פנויה)."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={
                "apartment_id": apartment_id,
                "arrived_at": "2020-01-01T08:00:00Z",
                "expected_until": "2020-01-01T09:00:00Z",
            },
        )

        # The GET triggers the reconcile pass before serving the panel.
        detail = await _apartment_detail(test_client, admin_token, apartment_id)
        assert detail["client_visits"][0]["status"] == "left"

        overview = await _overview_apartment(test_client, admin_token, building["id"], apartment_id)
        assert overview["has_active_client_visit"] is False

    async def test_delete_arrival_removes_it(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_apartment_id(building)
        created = await test_client.post(
            f"{BASE}/client-visits",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "arrived_at": "2026-07-13T09:00:00Z"},
        )
        visit_id = created.json()["id"]

        deleted = await test_client.delete(
            f"{BASE}/client-visits/{visit_id}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text

        detail = await _apartment_detail(test_client, admin_token, apartment_id)
        assert detail["client_visits"] == []
