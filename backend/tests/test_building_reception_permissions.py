"""Tests for per-building reception permissions (הרשאות דלפק לפי בניין).

These verify the building-scoped access model added on top of the reception
desk: an operator can be granted a single building's desk and is then confined
to it, while Admins and the legacy ``building_reception:*`` wildcard keep access
to every building.
"""
import pytest
from httpx import AsyncClient

from backend.models.user import User

BASE = "/api/v1/building-reception"
IAM = "/api/v1/iam"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_building(client: AsyncClient, token: str, *, name: str) -> dict:
    response = await client.post(
        f"{BASE}/buildings",
        headers=_auth(token),
        json={
            "name": name,
            "floors_count": 1,
            "units_per_floor": 2,
            "has_common_areas": False,
            "first_unit_number": 1,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
@pytest.mark.api
class TestPerBuildingReception:
    async def test_grant_confines_operator_to_one_building(
        self,
        test_client: AsyncClient,
        admin_token: str,
        member_token: str,
        member_user: User,
    ):
        """A member granted desk access to building A sees/acts on A only."""
        building_a = await _create_building(test_client, admin_token, name="בניין א")
        building_b = await _create_building(test_client, admin_token, name="בניין ב")

        # No grant yet -> the buildings list is denied for the member.
        denied = await test_client.get(f"{BASE}/buildings", headers=_auth(member_token))
        assert denied.status_code == 403, denied.text

        # Admin grants the member read+write on building A only, via the IAM API.
        grant = await test_client.post(
            f"{IAM}/users/{member_user.id}/building-reception",
            headers=_auth(admin_token),
            json={"building_id": building_a["id"], "actions": ["read", "write"]},
        )
        assert grant.status_code == 201, grant.text

        # The list is now allowed and contains ONLY building A.
        listed = await test_client.get(f"{BASE}/buildings", headers=_auth(member_token))
        assert listed.status_code == 200, listed.text
        ids = {b["id"] for b in listed.json()}
        assert ids == {building_a["id"]}

        # Reading building A is allowed; building B is forbidden.
        read_a = await test_client.get(
            f"{BASE}/buildings/{building_a['id']}", headers=_auth(member_token)
        )
        assert read_a.status_code == 200, read_a.text
        read_b = await test_client.get(
            f"{BASE}/buildings/{building_b['id']}", headers=_auth(member_token)
        )
        assert read_b.status_code == 403, read_b.text

        # Writing an apartment into A is allowed; into B is forbidden.
        write_a = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(member_token),
            json={"building_id": building_a["id"], "floor": 2, "unit_number": "A1"},
        )
        assert write_a.status_code == 200, write_a.text
        write_b = await test_client.post(
            f"{BASE}/apartments",
            headers=_auth(member_token),
            json={"building_id": building_b["id"], "floor": 2, "unit_number": "B1"},
        )
        assert write_b.status_code == 403, write_b.text

    async def test_scoped_operator_cannot_touch_other_building_apartment(
        self,
        test_client: AsyncClient,
        admin_token: str,
        member_token: str,
        member_user: User,
    ):
        """Grants are resolved through the apartment -> building chain, so a
        member scoped to A cannot update an apartment that belongs to B."""
        building_a = await _create_building(test_client, admin_token, name="בניין א")
        building_b = await _create_building(test_client, admin_token, name="בניין ב")
        apartment_b_id = building_b["apartments"][0]["id"]

        await test_client.post(
            f"{IAM}/users/{member_user.id}/building-reception",
            headers=_auth(admin_token),
            json={"building_id": building_a["id"], "actions": ["read", "write", "update"]},
        )

        # Updating an apartment in B is denied even though the member has update
        # on A (building is resolved from the apartment).
        update_b = await test_client.put(
            f"{BASE}/apartments/{apartment_b_id}",
            headers=_auth(member_token),
            json={"notes": "אסור"},
        )
        assert update_b.status_code == 403, update_b.text

    async def test_grant_list_and_revoke_roundtrip(
        self,
        test_client: AsyncClient,
        admin_token: str,
        member_user: User,
    ):
        """The IAM listing reflects grants and revocation removes access."""
        building = await _create_building(test_client, admin_token, name="בניין א")

        await test_client.post(
            f"{IAM}/users/{member_user.id}/building-reception",
            headers=_auth(admin_token),
            json={"building_id": building["id"], "actions": ["read", "write"]},
        )

        listed = await test_client.get(
            f"{IAM}/users/{member_user.id}/building-reception",
            headers=_auth(admin_token),
        )
        assert listed.status_code == 200, listed.text
        payload = listed.json()
        assert len(payload) == 1
        assert payload[0]["building_id"] == building["id"]
        assert payload[0]["building_name"] == "בניין א"
        assert sorted(payload[0]["actions"]) == ["read", "write"]

        revoke = await test_client.delete(
            f"{IAM}/users/{member_user.id}/building-reception/{building['id']}",
            headers=_auth(admin_token),
        )
        assert revoke.status_code == 200, revoke.text

        after = await test_client.get(
            f"{IAM}/users/{member_user.id}/building-reception",
            headers=_auth(admin_token),
        )
        assert after.json() == []

    async def test_invalid_action_is_rejected(
        self,
        test_client: AsyncClient,
        admin_token: str,
        member_user: User,
    ):
        building = await _create_building(test_client, admin_token, name="בניין א")
        bad = await test_client.post(
            f"{IAM}/users/{member_user.id}/building-reception",
            headers=_auth(admin_token),
            json={"building_id": building["id"], "actions": ["approve"]},
        )
        assert bad.status_code == 400, bad.text

    async def test_admin_still_sees_all_buildings(
        self,
        test_client: AsyncClient,
        admin_token: str,
    ):
        """Admins keep unrestricted access to every building's desk."""
        building_a = await _create_building(test_client, admin_token, name="בניין א")
        building_b = await _create_building(test_client, admin_token, name="בניין ב")

        listed = await test_client.get(f"{BASE}/buildings", headers=_auth(admin_token))
        assert listed.status_code == 200
        ids = {b["id"] for b in listed.json()}
        assert {building_a["id"], building_b["id"]} <= ids

    async def test_wildcard_policy_grants_every_building(
        self,
        test_client: AsyncClient,
        test_db,
        admin_token: str,
        member_token: str,
        member_user: User,
    ):
        """The legacy ``building_reception:*`` wildcard keeps whole-desk access."""
        from backend.iam.models import ResourcePolicy

        building_a = await _create_building(test_client, admin_token, name="בניין א")
        building_b = await _create_building(test_client, admin_token, name="בניין ב")

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

        listed = await test_client.get(f"{BASE}/buildings", headers=_auth(member_token))
        assert listed.status_code == 200
        ids = {b["id"] for b in listed.json()}
        assert {building_a["id"], building_b["id"]} <= ids
