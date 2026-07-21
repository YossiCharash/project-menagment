"""
Tests for GET /projects/{id}/all-transactions - the parent project's combined
transaction feed (parent + subprojects, date-filtered server-side).
"""
import pytest
from httpx import AsyncClient


async def _create_project(
    test_client: AsyncClient,
    admin_token: str,
    name: str,
    is_parent_project: bool = False,
    relation_project: int | None = None,
) -> int:
    """Create a project through the API and return its id."""
    payload = {
        "name": name,
        "description": f"{name} description",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31",
        "budget_monthly": 0.0,
        "budget_annual": 100000.0,
        "is_parent_project": is_parent_project,
    }
    if relation_project is not None:
        payload["relation_project"] = relation_project

    response = await test_client.post(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


async def _create_transaction(
    test_client: AsyncClient,
    admin_token: str,
    project_id: int,
    category_id: int,
    tx_date: str,
    amount: float,
    tx_type: str = "Income",
) -> int:
    """Create a transaction through the API and return its id."""
    response = await test_client.post(
        "/api/v1/transactions/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "project_id": project_id,
            "tx_date": tx_date,
            "type": tx_type,
            "amount": amount,
            "description": f"tx {tx_date}",
            "category_id": category_id,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


@pytest.mark.api
@pytest.mark.asyncio
class TestParentProjectAllTransactions:
    """The endpoint that replaced the client-side 1 + 1 + N transaction fan-out."""

    async def test_returns_parent_and_subproject_transactions(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """One call returns the parent's own transactions plus every subproject's."""
        parent_id = await _create_project(
            test_client, admin_token, "Parent A", is_parent_project=True
        )
        child_id = await _create_project(
            test_client, admin_token, "Child A", relation_project=parent_id
        )

        await _create_transaction(
            test_client, admin_token, parent_id, default_category, "2024-03-10", 100.0
        )
        await _create_transaction(
            test_client, admin_token, child_id, default_category, "2024-03-11", 200.0
        )

        response = await test_client.get(
            f"/api/v1/projects/{parent_id}/all-transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200, response.text
        rows = response.json()
        assert len(rows) == 2
        amounts = {row["amount"] for row in rows}
        assert amounts == {100.0, 200.0}

    async def test_labels_rows_with_their_project(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """Parent rows carry subproject_id=None; subproject rows carry their own id/name."""
        parent_id = await _create_project(
            test_client, admin_token, "Parent B", is_parent_project=True
        )
        child_id = await _create_project(
            test_client, admin_token, "Child B", relation_project=parent_id
        )

        await _create_transaction(
            test_client, admin_token, parent_id, default_category, "2024-03-10", 100.0
        )
        await _create_transaction(
            test_client, admin_token, child_id, default_category, "2024-03-11", 200.0
        )

        response = await test_client.get(
            f"/api/v1/projects/{parent_id}/all-transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        rows = {row["amount"]: row for row in response.json()}
        assert rows[100.0]["subproject_id"] is None
        assert rows[100.0]["subproject_name"] == "Parent B"
        assert rows[200.0]["subproject_id"] == child_id
        assert rows[200.0]["subproject_name"] == "Child B"

    async def test_filters_by_date_range_server_side(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """start_date/end_date are inclusive and applied before the response is built."""
        parent_id = await _create_project(
            test_client, admin_token, "Parent C", is_parent_project=True
        )
        child_id = await _create_project(
            test_client, admin_token, "Child C", relation_project=parent_id
        )

        await _create_transaction(
            test_client, admin_token, parent_id, default_category, "2024-01-15", 10.0
        )
        await _create_transaction(
            test_client, admin_token, child_id, default_category, "2024-03-01", 20.0
        )
        await _create_transaction(
            test_client, admin_token, child_id, default_category, "2024-03-31", 30.0
        )
        await _create_transaction(
            test_client, admin_token, child_id, default_category, "2024-05-02", 40.0
        )

        response = await test_client.get(
            f"/api/v1/projects/{parent_id}/all-transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start_date": "2024-03-01", "end_date": "2024-03-31"},
        )

        assert response.status_code == 200, response.text
        amounts = {row["amount"] for row in response.json()}
        assert amounts == {20.0, 30.0}

    async def test_sorted_newest_first(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """The client renders the list as-is, so ordering is the server's job."""
        parent_id = await _create_project(
            test_client, admin_token, "Parent D", is_parent_project=True
        )
        child_id = await _create_project(
            test_client, admin_token, "Child D", relation_project=parent_id
        )

        await _create_transaction(
            test_client, admin_token, parent_id, default_category, "2024-02-01", 10.0
        )
        await _create_transaction(
            test_client, admin_token, child_id, default_category, "2024-06-01", 20.0
        )
        await _create_transaction(
            test_client, admin_token, parent_id, default_category, "2024-04-01", 30.0
        )

        response = await test_client.get(
            f"/api/v1/projects/{parent_id}/all-transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        dates = [row["tx_date"] for row in response.json()]
        assert dates == sorted(dates, reverse=True)

    async def test_unknown_project_returns_404(
        self, test_client: AsyncClient, admin_token: str
    ):
        """A missing parent project is a 404, not an empty list."""
        response = await test_client.get(
            "/api/v1/projects/999999/all-transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404

    async def test_parent_without_subprojects_returns_own_transactions(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """A parent with no children still gets its own rows back."""
        parent_id = await _create_project(
            test_client, admin_token, "Parent E", is_parent_project=True
        )
        await _create_transaction(
            test_client, admin_token, parent_id, default_category, "2024-03-10", 55.0
        )

        response = await test_client.get(
            f"/api/v1/projects/{parent_id}/all-transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["amount"] == 55.0
        assert rows[0]["subproject_id"] is None
