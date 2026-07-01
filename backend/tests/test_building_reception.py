"""API tests for the Building Reception Desk (דלפק הבניין) module.

These exercise the full HTTP surface (and therefore the endpoint, service and
repository layers together) using the in-memory SQLite fixtures from
``conftest.py``. Auth follows the existing pattern in ``test_tasks_member.py``:
an admin has full access; a Member (non-admin desk operator) may read/write/
update but not delete.
"""
import pytest
from httpx import AsyncClient

from backend.models.user import User

BASE = "/api/v1/building-reception"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_building(
    client: AsyncClient,
    token: str,
    *,
    name: str = "בניין א",
    floors_count: int = 2,
    units_per_floor: int = 3,
    has_common_areas: bool = True,
) -> dict:
    """Create a building via the API and return the ``BuildingOut`` JSON."""
    response = await client.post(
        f"{BASE}/buildings",
        headers=_auth(token),
        json={
            "name": name,
            "address": "יערות ישראל, מודיעין",
            "compound_name": "מתחם יערות",
            "floors_count": floors_count,
            "units_per_floor": units_per_floor,
            "has_common_areas": has_common_areas,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _first_residential_apartment_id(building: dict) -> int:
    for apartment in building["apartments"]:
        if not apartment["is_common_area"]:
            return apartment["id"]
    raise AssertionError("no residential apartment in building")


@pytest.mark.asyncio
@pytest.mark.api
class TestBuildingCrud:
    async def test_create_building_auto_generates_apartments(
        self, test_client: AsyncClient, admin_token: str
    ):
        """floors_count × units_per_floor residential units + 3 common areas."""
        building = await _create_building(
            test_client, admin_token, floors_count=2, units_per_floor=3
        )
        apartments = building["apartments"]
        residential = [a for a in apartments if not a["is_common_area"]]
        commons = [a for a in apartments if a["is_common_area"]]

        assert len(residential) == 6
        assert len(commons) == 3
        unit_numbers = sorted(a["unit_number"] for a in residential)
        assert unit_numbers == ["101", "102", "103", "201", "202", "203"]
        assert {a["unit_number"] for a in commons} == {"לובי", "חניון", "מחסן"}

    async def test_create_building_without_common_areas(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(
            test_client, admin_token, has_common_areas=False,
            floors_count=3, units_per_floor=2,
        )
        assert len(building["apartments"]) == 6
        assert all(not a["is_common_area"] for a in building["apartments"])

    async def test_create_building_requires_name(
        self, test_client: AsyncClient, admin_token: str
    ):
        response = await test_client.post(
            f"{BASE}/buildings",
            headers=_auth(admin_token),
            json={"name": "", "floors_count": 1, "units_per_floor": 1},
        )
        # Empty name is rejected by schema validation (min_length=1).
        assert response.status_code == 422, response.text

    async def test_list_buildings_reports_apartment_count(
        self, test_client: AsyncClient, admin_token: str
    ):
        await _create_building(test_client, admin_token, floors_count=2, units_per_floor=3)
        response = await test_client.get(f"{BASE}/buildings", headers=_auth(admin_token))
        assert response.status_code == 200, response.text
        buildings = response.json()
        assert len(buildings) >= 1
        assert buildings[0]["apartments_count"] == 9

    async def test_get_building_overview(
        self, test_client: AsyncClient, admin_token: str
    ):
        created = await _create_building(test_client, admin_token)
        response = await test_client.get(
            f"{BASE}/buildings/{created['id']}", headers=_auth(admin_token)
        )
        assert response.status_code == 200, response.text
        assert response.json()["id"] == created["id"]

    async def test_get_missing_building_returns_404(
        self, test_client: AsyncClient, admin_token: str
    ):
        response = await test_client.get(f"{BASE}/buildings/999999", headers=_auth(admin_token))
        assert response.status_code == 404, response.text

    async def test_update_building(self, test_client: AsyncClient, admin_token: str):
        created = await _create_building(test_client, admin_token)
        response = await test_client.put(
            f"{BASE}/buildings/{created['id']}",
            headers=_auth(admin_token),
            json={"name": "בניין מעודכן"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["name"] == "בניין מעודכן"

    async def test_delete_building(self, test_client: AsyncClient, admin_token: str):
        created = await _create_building(test_client, admin_token)
        response = await test_client.delete(
            f"{BASE}/buildings/{created['id']}", headers=_auth(admin_token)
        )
        assert response.status_code == 204, response.text
        follow_up = await test_client.get(
            f"{BASE}/buildings/{created['id']}", headers=_auth(admin_token)
        )
        assert follow_up.status_code == 404


@pytest.mark.asyncio
@pytest.mark.api
class TestApartmentAndTenant:
    async def test_apartment_detail_starts_empty(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        response = await test_client.get(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
        )
        assert response.status_code == 200, response.text
        detail = response.json()
        assert detail["current_tenant"] is None
        assert detail["keys"] == []
        assert detail["deliveries"] == []
        assert detail["vehicles"] == []

    async def test_missing_apartment_returns_404(
        self, test_client: AsyncClient, admin_token: str
    ):
        response = await test_client.get(f"{BASE}/apartments/999999", headers=_auth(admin_token))
        assert response.status_code == 404, response.text

    async def test_swap_tenant_moves_previous_to_history(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        first = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/tenant",
            headers=_auth(admin_token),
            json={"name": "דייר ראשון", "move_in_date": "2024-01-01"},
        )
        assert first.status_code == 200, first.text
        assert first.json()["is_current"] is True

        second = await test_client.post(
            f"{BASE}/apartments/{apartment_id}/tenant",
            headers=_auth(admin_token),
            json={"name": "דייר שני"},
        )
        assert second.status_code == 200, second.text

        detail = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
            )
        ).json()
        assert detail["current_tenant"]["name"] == "דייר שני"
        assert len(detail["tenants"]) == 2
        history = [t for t in detail["tenants"] if not t["is_current"]]
        assert history[0]["name"] == "דייר ראשון"
        assert history[0]["move_out_date"] is not None
        kinds = {a["kind"] for a in detail["activities"]}
        assert "tenant_changed" in kinds


@pytest.mark.asyncio
@pytest.mark.api
class TestKeys:
    async def test_key_hand_out_and_return_flow(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        key = (
            await test_client.post(
                f"{BASE}/keys",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "label": "מפתח ראשי"},
            )
        ).json()
        assert key["holder"] == "in_desk"
        key_id = key["id"]

        handed_out = (
            await test_client.post(
                f"{BASE}/keys/{key_id}/transfer",
                headers=_auth(admin_token),
                json={"direction": "out", "counterparty_name": "משה לוי", "note": "עד מחר"},
            )
        ).json()
        assert handed_out["holder"] == "out"
        assert handed_out["holder_name"] == "משה לוי"
        assert len(handed_out["transfers"]) == 1

        returned = (
            await test_client.post(
                f"{BASE}/keys/{key_id}/transfer",
                headers=_auth(admin_token),
                json={"direction": "return", "counterparty_name": "משה לוי"},
            )
        ).json()
        assert returned["holder"] == "in_desk"
        assert returned["holder_name"] is None
        assert len(returned["transfers"]) == 2

        detail = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
            )
        ).json()
        kinds = [a["kind"] for a in detail["activities"]]
        assert "key_out" in kinds and "key_in" in kinds

    async def test_transfer_invalid_direction_rejected(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        key = (
            await test_client.post(
                f"{BASE}/keys",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "label": "מפתח"},
            )
        ).json()
        response = await test_client.post(
            f"{BASE}/keys/{key['id']}/transfer",
            headers=_auth(admin_token),
            json={"direction": "sideways", "counterparty_name": "מישהו"},
        )
        assert response.status_code == 422, response.text

    async def test_transfer_missing_key_returns_400(
        self, test_client: AsyncClient, admin_token: str
    ):
        response = await test_client.post(
            f"{BASE}/keys/999999/transfer",
            headers=_auth(admin_token),
            json={"direction": "out", "counterparty_name": "מישהו"},
        )
        assert response.status_code == 400, response.text


@pytest.mark.asyncio
@pytest.mark.api
class TestVehiclesAndDeliveries:
    async def test_vehicle_create_list_delete(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        vehicle = (
            await test_client.post(
                f"{BASE}/vehicles",
                headers=_auth(admin_token),
                json={
                    "apartment_id": apartment_id,
                    "plate": "12-345-67",
                    "model": "מאזדה 3",
                    "owner_name": "דנה כהן",
                    "parking_spot": "B-14",
                },
            )
        ).json()
        assert vehicle["plate"] == "12-345-67"

        listed = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}/vehicles", headers=_auth(admin_token)
            )
        ).json()
        assert len(listed) == 1

        deleted = await test_client.delete(
            f"{BASE}/vehicles/{vehicle['id']}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text

    async def test_delivery_create_and_mark_delivered(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        delivery = (
            await test_client.post(
                f"{BASE}/deliveries",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "title": "חבילה מאמזון", "kind": "package"},
            )
        ).json()
        assert delivery["status"] == "pending"
        assert delivery["received_at"] is None

        delivered = (
            await test_client.post(
                f"{BASE}/deliveries/{delivery['id']}/deliver", headers=_auth(admin_token)
            )
        ).json()
        assert delivered["status"] == "delivered"
        assert delivered["received_at"] is not None

        detail = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
            )
        ).json()
        assert any(a["kind"] == "delivery" for a in detail["activities"])


@pytest.mark.asyncio
@pytest.mark.api
class TestPermissions:
    async def test_unauthenticated_is_rejected(self, test_client: AsyncClient):
        response = await test_client.get(f"{BASE}/buildings")
        assert response.status_code == 401, response.text

    async def test_member_is_denied_by_default(
        self, test_client: AsyncClient, member_token: str
    ):
        """Reception desk is admin-managed; a plain Member has no access."""
        read = await test_client.get(f"{BASE}/buildings", headers=_auth(member_token))
        assert read.status_code == 403, read.text

        write = await test_client.post(
            f"{BASE}/buildings",
            headers=_auth(member_token),
            json={"name": "בניין", "floors_count": 1, "units_per_floor": 1},
        )
        assert write.status_code == 403, write.text

    async def test_member_cannot_delete_building(
        self, test_client: AsyncClient, admin_token: str, member_token: str
    ):
        created = await _create_building(test_client, admin_token)
        response = await test_client.delete(
            f"{BASE}/buildings/{created['id']}", headers=_auth(member_token)
        )
        assert response.status_code == 403, response.text


@pytest.mark.asyncio
@pytest.mark.api
class TestTaskApartmentLink:
    async def test_task_can_be_linked_to_apartment(
        self, test_client: AsyncClient, admin_token: str, admin_user: User
    ):
        """A reception-desk task reuses the existing Task flow with apartment_id."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        response = await test_client.post(
            "/api/v1/tasks/",
            headers=_auth(admin_token),
            json={
                "title": "לתקן דוד שמש",
                "assigned_to_user_id": admin_user.id,
                "apartment_id": apartment_id,
            },
        )
        assert response.status_code in (200, 201), response.text
        assert response.json()["apartment_id"] == apartment_id


@pytest.mark.asyncio
@pytest.mark.api
class TestApartmentCrud:
    async def test_add_apartment_to_building(
        self, test_client: AsyncClient, admin_token: str
    ):
        building = await _create_building(test_client, admin_token)
        response = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(admin_token),
            json={"building_id": building["id"], "floor": 9, "unit_number": "901"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["unit_number"] == "901"

        overview = await test_client.get(
            f"{BASE}/buildings/{building['id']}", headers=_auth(admin_token)
        )
        numbers = [a["unit_number"] for a in overview.json()["apartments"]]
        assert "901" in numbers

    async def test_add_apartment_unknown_building_400(
        self, test_client: AsyncClient, admin_token: str
    ):
        response = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(admin_token),
            json={"building_id": 999999, "floor": 1, "unit_number": "1"},
        )
        assert response.status_code == 400, response.text

    async def test_delete_apartment(self, test_client: AsyncClient, admin_token: str):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        deleted = await test_client.delete(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text
        follow_up = await test_client.get(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
        )
        assert follow_up.status_code == 404

    async def test_member_cannot_delete_apartment(
        self, test_client: AsyncClient, admin_token: str, member_token: str
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        response = await test_client.delete(
            f"{BASE}/apartments/{apartment_id}", headers=_auth(member_token)
        )
        assert response.status_code == 403, response.text


@pytest.mark.asyncio
@pytest.mark.api
class TestDeletes:
    async def _apartment(self, test_client: AsyncClient, admin_token: str) -> int:
        building = await _create_building(test_client, admin_token)
        return _first_residential_apartment_id(building)

    async def test_delete_tenant_from_history(
        self, test_client: AsyncClient, admin_token: str
    ):
        apartment_id = await self._apartment(test_client, admin_token)
        tenant = (
            await test_client.post(
                f"{BASE}/apartments/{apartment_id}/tenant",
                headers=_auth(admin_token),
                json={"name": "דייר להסרה"},
            )
        ).json()
        deleted = await test_client.delete(
            f"{BASE}/tenants/{tenant['id']}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text
        detail = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
            )
        ).json()
        assert all(t["id"] != tenant["id"] for t in detail["tenants"])

    async def test_delete_key(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        key = (
            await test_client.post(
                f"{BASE}/keys",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "label": "מפתח"},
            )
        ).json()
        deleted = await test_client.delete(
            f"{BASE}/keys/{key['id']}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text
        keys = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}/keys", headers=_auth(admin_token)
            )
        ).json()
        assert keys == []

    async def test_delete_delivery(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        delivery = (
            await test_client.post(
                f"{BASE}/deliveries",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "title": "חבילה"},
            )
        ).json()
        deleted = await test_client.delete(
            f"{BASE}/deliveries/{delivery['id']}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text

    async def test_delete_missing_key_404(self, test_client: AsyncClient, admin_token: str):
        response = await test_client.delete(f"{BASE}/keys/999999", headers=_auth(admin_token))
        assert response.status_code == 404, response.text


@pytest.mark.asyncio
@pytest.mark.api
class TestEdits:
    async def _apartment(self, test_client: AsyncClient, admin_token: str) -> int:
        building = await _create_building(test_client, admin_token)
        return _first_residential_apartment_id(building)

    async def test_update_tenant(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        tenant = (
            await test_client.post(
                f"{BASE}/apartments/{apartment_id}/tenant",
                headers=_auth(admin_token),
                json={"name": "שם ישן"},
            )
        ).json()
        response = await test_client.put(
            f"{BASE}/tenants/{tenant['id']}",
            headers=_auth(admin_token),
            json={"name": "שם חדש", "phone": "050-1234567"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["name"] == "שם חדש"
        assert response.json()["phone"] == "050-1234567"

    async def test_rename_key(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        key = (
            await test_client.post(
                f"{BASE}/keys",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "label": "ישן"},
            )
        ).json()
        response = await test_client.put(
            f"{BASE}/keys/{key['id']}",
            headers=_auth(admin_token),
            json={"label": "מפתח כניסה ראשי"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["label"] == "מפתח כניסה ראשי"

    async def test_update_delivery_status(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        delivery = (
            await test_client.post(
                f"{BASE}/deliveries",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "title": "חבילה"},
            )
        ).json()
        response = await test_client.put(
            f"{BASE}/deliveries/{delivery['id']}",
            headers=_auth(admin_token),
            json={"title": "חבילה גדולה", "status": "delivered"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["title"] == "חבילה גדולה"
        assert body["status"] == "delivered"
        assert body["received_at"] is not None

    async def test_update_vehicle(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        vehicle = (
            await test_client.post(
                f"{BASE}/vehicles",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "plate": "11-111-11", "owner_name": "דן"},
            )
        ).json()
        response = await test_client.put(
            f"{BASE}/vehicles/{vehicle['id']}",
            headers=_auth(admin_token),
            json={"parking_spot": "A-1", "owner_name": "דנה"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["parking_spot"] == "A-1"
        assert body["owner_name"] == "דנה"

    async def test_update_missing_tenant_404(self, test_client: AsyncClient, admin_token: str):
        response = await test_client.put(
            f"{BASE}/tenants/999999", headers=_auth(admin_token), json={"name": "x"}
        )
        assert response.status_code == 404, response.text
