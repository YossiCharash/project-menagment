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
    first_unit_number: int = 1,
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
            "first_unit_number": first_unit_number,
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
        # Sequential ascending numbering starting at the default first unit (1),
        # continuous across floors — no per-floor "hundreds" jump.
        unit_numbers = sorted((int(a["unit_number"]) for a in residential))
        assert unit_numbers == [1, 2, 3, 4, 5, 6]
        assert {a["unit_number"] for a in commons} == {"לובי", "חניון", "מחסן"}

    async def test_apartments_numbered_from_custom_first_number(
        self, test_client: AsyncClient, admin_token: str
    ):
        """The admin-supplied first number seeds a continuous ascending sequence."""
        building = await _create_building(
            test_client,
            admin_token,
            floors_count=3,
            units_per_floor=2,
            has_common_areas=False,
            first_unit_number=101,
        )
        residential = [a for a in building["apartments"] if not a["is_common_area"]]
        unit_numbers = sorted(int(a["unit_number"]) for a in residential)
        assert unit_numbers == [101, 102, 103, 104, 105, 106]

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
class TestProjects:
    async def _create_project(self, client: AsyncClient, token: str, name: str = "מתחם יערות") -> dict:
        response = await client.post(
            f"{BASE}/projects",
            headers=_auth(token),
            json={"name": name, "description": "פרויקט מגורים"},
        )
        assert response.status_code == 200, response.text
        return response.json()

    async def test_create_and_list_projects(self, test_client: AsyncClient, admin_token: str):
        project = await self._create_project(test_client, admin_token)
        assert project["name"] == "מתחם יערות"
        listed = await test_client.get(f"{BASE}/projects", headers=_auth(admin_token))
        assert listed.status_code == 200, listed.text
        assert any(p["id"] == project["id"] for p in listed.json())

    async def test_building_created_under_project(self, test_client: AsyncClient, admin_token: str):
        project = await self._create_project(test_client, admin_token)
        response = await test_client.post(
            f"{BASE}/buildings",
            headers=_auth(admin_token),
            json={
                "name": "בניין A",
                "project_id": project["id"],
                "floors_count": 1,
                "units_per_floor": 2,
                "has_common_areas": False,
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["project_id"] == project["id"]

        detail = await test_client.get(f"{BASE}/projects/{project['id']}", headers=_auth(admin_token))
        building_ids = [b["id"] for b in detail.json()["buildings"]]
        assert response.json()["id"] in building_ids

    async def test_filter_buildings_by_project(self, test_client: AsyncClient, admin_token: str):
        project = await self._create_project(test_client, admin_token, name="מתחם ב")
        await test_client.post(
            f"{BASE}/buildings",
            headers=_auth(admin_token),
            json={"name": "שייך", "project_id": project["id"], "floors_count": 1, "units_per_floor": 1},
        )
        await _create_building(test_client, admin_token, name="לא שייך")
        filtered = await test_client.get(
            f"{BASE}/buildings", headers=_auth(admin_token), params={"project_id": project["id"]}
        )
        names = [b["name"] for b in filtered.json()]
        assert names == ["שייך"]

    async def test_create_building_unknown_project_400(self, test_client: AsyncClient, admin_token: str):
        response = await test_client.post(
            f"{BASE}/buildings",
            headers=_auth(admin_token),
            json={"name": "x", "project_id": 999999, "floors_count": 1, "units_per_floor": 1},
        )
        assert response.status_code == 400, response.text

    async def test_update_project_edits_name_and_description(
        self, test_client: AsyncClient, admin_token: str
    ):
        project = await self._create_project(test_client, admin_token, name="שם ישן")
        response = await test_client.put(
            f"{BASE}/projects/{project['id']}",
            headers=_auth(admin_token),
            json={"name": "שם חדש", "description": "תיאור מעודכן"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["name"] == "שם חדש"
        assert response.json()["description"] == "תיאור מעודכן"

        reloaded = await test_client.get(
            f"{BASE}/projects/{project['id']}", headers=_auth(admin_token)
        )
        assert reloaded.json()["name"] == "שם חדש"

    async def test_delete_project_detaches_buildings(self, test_client: AsyncClient, admin_token: str):
        project = await self._create_project(test_client, admin_token, name="למחיקה")
        building = (
            await test_client.post(
                f"{BASE}/buildings",
                headers=_auth(admin_token),
                json={"name": "בניין", "project_id": project["id"], "floors_count": 1, "units_per_floor": 1},
            )
        ).json()
        deleted = await test_client.delete(f"{BASE}/projects/{project['id']}", headers=_auth(admin_token))
        assert deleted.status_code == 204, deleted.text
        after = await test_client.get(f"{BASE}/buildings/{building['id']}", headers=_auth(admin_token))
        assert after.json()["project_id"] is None


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

    async def test_delete_apartment_renumbers_later_units(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Deleting #3 shifts 4,5,6 down to 3,4,5 so numbering stays contiguous."""
        building = await _create_building(
            test_client, admin_token, floors_count=2, units_per_floor=3
        )
        apartments = {
            a["unit_number"]: a["id"]
            for a in building["apartments"]
            if not a["is_common_area"]
        }
        assert sorted(int(n) for n in apartments) == [1, 2, 3, 4, 5, 6]

        deleted = await test_client.delete(
            f"{BASE}/apartments/{apartments['3']}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text

        overview = await test_client.get(
            f"{BASE}/buildings/{building['id']}", headers=_auth(admin_token)
        )
        assert overview.status_code == 200, overview.text
        after = overview.json()["apartments"]
        residential = sorted(
            int(a["unit_number"]) for a in after if not a["is_common_area"]
        )
        assert residential == [1, 2, 3, 4, 5]
        # Common areas keep their text labels — only numeric units are renumbered.
        commons = {a["unit_number"] for a in after if a["is_common_area"]}
        assert commons == {"לובי", "חניון", "מחסן"}

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

    async def test_overview_splits_key_counts_by_holder(
        self, test_client: AsyncClient, admin_token: str
    ):
        """The building overview reports desk-held vs handed-out keys separately
        so the grid can show a "מפתח אצל הדלפק" marker and a "הוצאנו מפתח" one."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        first_key = (
            await test_client.post(
                f"{BASE}/keys",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "label": "מפתח ראשי"},
            )
        ).json()
        await test_client.post(
            f"{BASE}/keys",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "label": "מפתח משני"},
        )

        # Both keys start life at the desk.
        summary = await self._apartment_summary(
            test_client, admin_token, building["id"], apartment_id
        )
        assert summary["keys_count"] == 2
        assert summary["keys_in_desk_count"] == 2
        assert summary["keys_out_count"] == 0

        # Hand one key out → the split shifts by one in each direction.
        await test_client.post(
            f"{BASE}/keys/{first_key['id']}/transfer",
            headers=_auth(admin_token),
            json={"direction": "out", "counterparty_name": "משה לוי"},
        )
        summary = await self._apartment_summary(
            test_client, admin_token, building["id"], apartment_id
        )
        assert summary["keys_count"] == 2
        assert summary["keys_in_desk_count"] == 1
        assert summary["keys_out_count"] == 1

    async def _apartment_summary(
        self, client: AsyncClient, token: str, building_id: int, apartment_id: int
    ) -> dict:
        response = await client.get(
            f"{BASE}/buildings/{building_id}", headers=_auth(token)
        )
        assert response.status_code == 200, response.text
        return next(a for a in response.json()["apartments"] if a["id"] == apartment_id)

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

    async def test_desk_operator_manages_contents_but_not_buildings(
        self,
        test_client: AsyncClient,
        test_db,
        admin_token: str,
        member_token: str,
        member_user: User,
    ):
        """A desk operator granted BUILDING_RECEPTION write manages the contents
        (e.g. apartments) but is still denied creating or deleting whole
        buildings, which are gated on the admin-only BUILDING resource."""
        from backend.iam.models import ResourcePolicy

        for action in ("read", "write"):
            test_db.add(
                ResourcePolicy(
                    user_id=member_user.id,
                    resource_type="building_reception",
                    resource_id="*",
                    action=action,
                    effect="allow",
                )
            )
        await test_db.commit()

        building = await _create_building(test_client, admin_token)

        # Contents: the desk operator may add an apartment.
        add_apartment = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(member_token),
            json={"building_id": building["id"], "floor": 3, "unit_number": "301"},
        )
        assert add_apartment.status_code == 200, add_apartment.text

        # Structure: the desk operator may NOT create a building.
        create_building = await test_client.post(
            f"{BASE}/buildings",
            headers=_auth(member_token),
            json={"name": "בניין אסור", "floors_count": 1, "units_per_floor": 1},
        )
        assert create_building.status_code == 403, create_building.text

        # ...nor delete one.
        delete_building = await test_client.delete(
            f"{BASE}/buildings/{building['id']}", headers=_auth(member_token)
        )
        assert delete_building.status_code == 403, delete_building.text


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

    async def test_apartment_tasks_are_listed(
        self, test_client: AsyncClient, admin_token: str, admin_user: User
    ):
        """A task created against an apartment shows in its desk task list."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        await test_client.post(
            "/api/v1/tasks/",
            headers=_auth(admin_token),
            json={"title": "לבדוק נזילה", "assigned_to_user_id": admin_user.id, "apartment_id": apartment_id},
        )
        response = await test_client.get(
            f"{BASE}/apartments/{apartment_id}/tasks", headers=_auth(admin_token)
        )
        assert response.status_code == 200, response.text
        tasks = response.json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "לבדוק נזילה"
        assert tasks[0]["assignee_name"] == admin_user.full_name

    async def test_archived_apartment_tasks_listed_separately(
        self, test_client: AsyncClient, admin_token: str, admin_user: User
    ):
        """`archived=true` returns the apartment's archived (אורכבו) tasks, and the
        default (open) listing excludes them."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        created = await test_client.post(
            "/api/v1/tasks/",
            headers=_auth(admin_token),
            json={"title": "משימה ישנה", "assigned_to_user_id": admin_user.id, "apartment_id": apartment_id},
        )
        task_id = created.json()["id"]
        archived = await test_client.post(f"/api/v1/tasks/{task_id}/archive", headers=_auth(admin_token))
        assert archived.status_code in (200, 201), archived.text

        # Default listing (open only) no longer shows the archived task.
        open_tasks = await test_client.get(
            f"{BASE}/apartments/{apartment_id}/tasks", headers=_auth(admin_token)
        )
        assert open_tasks.status_code == 200, open_tasks.text
        assert open_tasks.json() == []

        # The archived view surfaces it.
        archived_tasks = await test_client.get(
            f"{BASE}/apartments/{apartment_id}/tasks",
            params={"archived": "true"},
            headers=_auth(admin_token),
        )
        assert archived_tasks.status_code == 200, archived_tasks.text
        body = archived_tasks.json()
        assert len(body) == 1
        assert body[0]["id"] == task_id
        assert body[0]["title"] == "משימה ישנה"


@pytest.mark.asyncio
@pytest.mark.api
class TestApartmentOpenTasksCount:
    """The building overview exposes an open-task count per apartment so the
    reception grid can flag apartments that still have work pending."""

    async def _open_tasks_count(self, client: AsyncClient, token: str, building_id: int, apartment_id: int) -> int:
        response = await client.get(f"{BASE}/buildings/{building_id}", headers=_auth(token))
        assert response.status_code == 200, response.text
        apartment = next(a for a in response.json()["apartments"] if a["id"] == apartment_id)
        return apartment["open_tasks_count"]

    async def test_pending_task_counts_as_open(
        self, test_client: AsyncClient, admin_token: str, admin_user: User
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        await test_client.post(
            "/api/v1/tasks/",
            headers=_auth(admin_token),
            json={"title": "לתקן מעלית", "assigned_to_user_id": admin_user.id, "apartment_id": apartment_id},
        )
        assert await self._open_tasks_count(test_client, admin_token, building["id"], apartment_id) == 1

    async def test_completed_task_is_not_open(
        self, test_client: AsyncClient, admin_token: str, admin_user: User
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        created = await test_client.post(
            "/api/v1/tasks/",
            headers=_auth(admin_token),
            json={"title": "להחליף נורה", "assigned_to_user_id": admin_user.id, "apartment_id": apartment_id},
        )
        task_id = created.json()["id"]
        completed = await test_client.put(
            f"/api/v1/tasks/{task_id}",
            headers=_auth(admin_token),
            json={"status": "completed"},
        )
        assert completed.status_code in (200, 201), completed.text
        assert await self._open_tasks_count(test_client, admin_token, building["id"], apartment_id) == 0

    async def test_archived_task_is_not_open(
        self, test_client: AsyncClient, admin_token: str, admin_user: User
    ):
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)
        created = await test_client.post(
            "/api/v1/tasks/",
            headers=_auth(admin_token),
            json={"title": "לבדוק ביוב", "assigned_to_user_id": admin_user.id, "apartment_id": apartment_id},
        )
        task_id = created.json()["id"]
        archived = await test_client.post(f"/api/v1/tasks/{task_id}/archive", headers=_auth(admin_token))
        assert archived.status_code in (200, 201), archived.text
        assert await self._open_tasks_count(test_client, admin_token, building["id"], apartment_id) == 0


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

    async def test_add_apartment_with_card_details(
        self, test_client: AsyncClient, admin_token: str
    ):
        """The new owner/management/attorneys/equipment/notes fields round-trip."""
        building = await _create_building(test_client, admin_token)
        response = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(admin_token),
            json={
                "building_id": building["id"],
                "floor": 5,
                "unit_number": "505",
                "owner_name": "יוסי כהן",
                "owner_phone": "050-1112222",
                "management_company_name": "ניהול מבנים בע\"מ",
                "management_company_phone": "03-9998888",
                "attorneys": "אבי לוי 052-1234567\nרינה גל 053-7654321",
                "equipment": "מזגן מרכזי\nדוד שמש",
                "notes": "כניסה מהחניון בלבד",
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["owner_name"] == "יוסי כהן"
        assert body["owner_phone"] == "050-1112222"
        assert body["management_company_name"] == "ניהול מבנים בע\"מ"
        assert body["management_company_phone"] == "03-9998888"
        assert body["attorneys"].splitlines()[0] == "אבי לוי 052-1234567"
        assert body["equipment"] == "מזגן מרכזי\nדוד שמש"
        assert body["notes"] == "כניסה מהחניון בלבד"

    async def test_add_apartment_blank_card_details_become_null(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Whitespace-only card fields are normalized to None on create."""
        building = await _create_building(test_client, admin_token)
        response = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(admin_token),
            json={
                "building_id": building["id"],
                "floor": 6,
                "unit_number": "606",
                "owner_name": "   ",
                "notes": "",
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["owner_name"] is None
        assert body["notes"] is None

    async def test_update_apartment_card_details(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Updating card fields persists, and an empty string clears back to None."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        updated = await test_client.put(
            f"{BASE}/apartments/{apartment_id}",
            headers=_auth(admin_token),
            json={
                "owner_name": "דנה כהן",
                "owner_phone": "054-0001111",
                "management_company_name": "חברת ניהול צפון",
                "equipment": "ריהוט מלא",
                "notes": "הערה חשובה",
            },
        )
        assert updated.status_code == 200, updated.text
        body = updated.json()
        assert body["owner_name"] == "דנה כהן"
        assert body["owner_phone"] == "054-0001111"
        assert body["management_company_name"] == "חברת ניהול צפון"
        assert body["equipment"] == "ריהוט מלא"
        assert body["notes"] == "הערה חשובה"

        cleared = await test_client.put(
            f"{BASE}/apartments/{apartment_id}",
            headers=_auth(admin_token),
            json={"notes": "", "owner_name": "   "},
        )
        assert cleared.status_code == 200, cleared.text
        cleared_body = cleared.json()
        assert cleared_body["notes"] is None
        assert cleared_body["owner_name"] is None
        # A field not sent in the update keeps its previous value.
        assert cleared_body["management_company_name"] == "חברת ניהול צפון"

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


@pytest.mark.asyncio
@pytest.mark.api
class TestTechnicianVisits:
    """Technician entry/exit tracking (כניסת טכנאי) at the reception desk."""

    async def _apartment(self, test_client: AsyncClient, admin_token: str) -> int:
        building = await _create_building(test_client, admin_token)
        return _first_residential_apartment_id(building)

    async def test_create_visit_records_activity_and_appears_in_detail(
        self, test_client: AsyncClient, admin_token: str
    ):
        apartment_id = await self._apartment(test_client, admin_token)

        visit = (
            await test_client.post(
                f"{BASE}/technician-visits",
                headers=_auth(admin_token),
                json={
                    "apartment_id": apartment_id,
                    "name": "ישראל ישראלי",
                    "role": "חשמלאי",
                    "phone": "050-1234567",
                    "note": "תיקון לוח חשמל",
                },
            )
        ).json()
        assert visit["name"] == "ישראל ישראלי"
        assert visit["role"] == "חשמלאי"
        assert visit["status"] == "inside"
        assert visit["left_at"] is None

        detail = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}", headers=_auth(admin_token)
            )
        ).json()
        assert any(v["id"] == visit["id"] for v in detail["technician_visits"])
        assert any(a["kind"] == "technician" for a in detail["activities"])

    async def test_create_visit_blank_name_400(
        self, test_client: AsyncClient, admin_token: str
    ):
        apartment_id = await self._apartment(test_client, admin_token)
        response = await test_client.post(
            f"{BASE}/technician-visits",
            headers=_auth(admin_token),
            json={"apartment_id": apartment_id, "name": "   "},
        )
        assert response.status_code == 400, response.text
        assert "טכנאי" in response.json()["detail"]

    async def test_overview_flags_technician_inside(
        self, test_client: AsyncClient, admin_token: str
    ):
        """The building overview exposes technicians_inside_count so the grid tile
        can flag a technician-in-progress without opening the apartment panel."""
        building = await _create_building(test_client, admin_token)
        apartment_id = _first_residential_apartment_id(building)

        async def _count() -> int:
            overview = (
                await test_client.get(
                    f"{BASE}/buildings/{building['id']}", headers=_auth(admin_token)
                )
            ).json()
            apartment = next(a for a in overview["apartments"] if a["id"] == apartment_id)
            return apartment["technicians_inside_count"]

        assert await _count() == 0
        visit = (
            await test_client.post(
                f"{BASE}/technician-visits",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "name": "חשמלאי"},
            )
        ).json()
        assert await _count() == 1

        # Once the technician leaves the apartment the flag clears again.
        await test_client.post(
            f"{BASE}/technician-visits/{visit['id']}/exit", headers=_auth(admin_token)
        )
        assert await _count() == 0

    async def test_mark_exit_sets_status_and_left_at(
        self, test_client: AsyncClient, admin_token: str
    ):
        apartment_id = await self._apartment(test_client, admin_token)
        visit = (
            await test_client.post(
                f"{BASE}/technician-visits",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "name": "טכנאי מיזוג"},
            )
        ).json()

        left = (
            await test_client.post(
                f"{BASE}/technician-visits/{visit['id']}/exit", headers=_auth(admin_token)
            )
        ).json()
        assert left["status"] == "left"
        assert left["left_at"] is not None

    async def test_double_exit_400(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        visit = (
            await test_client.post(
                f"{BASE}/technician-visits",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "name": "אינסטלטור"},
            )
        ).json()
        await test_client.post(
            f"{BASE}/technician-visits/{visit['id']}/exit", headers=_auth(admin_token)
        )
        again = await test_client.post(
            f"{BASE}/technician-visits/{visit['id']}/exit", headers=_auth(admin_token)
        )
        assert again.status_code == 400, again.text

    async def test_update_visit(self, test_client: AsyncClient, admin_token: str):
        apartment_id = await self._apartment(test_client, admin_token)
        visit = (
            await test_client.post(
                f"{BASE}/technician-visits",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "name": "טכנאי"},
            )
        ).json()
        response = await test_client.put(
            f"{BASE}/technician-visits/{visit['id']}",
            headers=_auth(admin_token),
            json={"name": "טכנאי בכיר", "role": "מיזוג", "phone": "052-7654321"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["name"] == "טכנאי בכיר"
        assert body["role"] == "מיזוג"
        assert body["phone"] == "052-7654321"

    async def test_list_and_delete_visit(
        self, test_client: AsyncClient, admin_token: str
    ):
        apartment_id = await self._apartment(test_client, admin_token)
        visit = (
            await test_client.post(
                f"{BASE}/technician-visits",
                headers=_auth(admin_token),
                json={"apartment_id": apartment_id, "name": "טכנאי למחיקה"},
            )
        ).json()

        listed = (
            await test_client.get(
                f"{BASE}/apartments/{apartment_id}/technician-visits",
                headers=_auth(admin_token),
            )
        ).json()
        assert len(listed) == 1

        deleted = await test_client.delete(
            f"{BASE}/technician-visits/{visit['id']}", headers=_auth(admin_token)
        )
        assert deleted.status_code == 204, deleted.text
        repeat = await test_client.delete(
            f"{BASE}/technician-visits/{visit['id']}", headers=_auth(admin_token)
        )
        assert repeat.status_code == 404, repeat.text
