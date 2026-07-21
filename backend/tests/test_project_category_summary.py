"""
Tests for GET /projects/category-summary - the aggregate that replaced the
project-list pages' one-request-per-project fan-out over
/transactions/project/{id}.
"""
from datetime import date

import pytest
from httpx import AsyncClient

# Contract dates are derived from today, not hard-coded: a project whose contract
# has already ended gets auto-renewed on read, which moves its start/end forward
# and would silently push fixed test dates outside the window that both this
# endpoint and /transactions/project/{id} filter by.
CONTRACT_START = date(date.today().year, 1, 1)
CONTRACT_END = date(date.today().year + 1, 1, 1)
INSIDE_CONTRACT = date(date.today().year, 3, 1)
INSIDE_CONTRACT_LATER = date(date.today().year, 3, 2)
BEFORE_CONTRACT = date(date.today().year - 1, 6, 1)


async def _create_project(
    test_client: AsyncClient, admin_token: str, name: str
) -> int:
    """Create a project through the API and return its id."""
    response = await test_client.post(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": name,
            "description": f"{name} description",
            "start_date": CONTRACT_START.isoformat(),
            "end_date": CONTRACT_END.isoformat(),
            "budget_monthly": 0.0,
            "budget_annual": 100000.0,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


async def _create_transaction(
    test_client: AsyncClient,
    admin_token: str,
    project_id: int,
    category_id: int,
    tx_date,
    amount: float,
    tx_type: str = "Income",
) -> None:
    """Create a transaction through the API."""
    response = await test_client.post(
        "/api/v1/transactions/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "project_id": project_id,
            "tx_date": tx_date.isoformat(),
            "type": tx_type,
            "amount": amount,
            "description": f"tx {tx_date}",
            "category_id": category_id,
        },
    )
    assert response.status_code == 200, response.text


async def _fetch_summary(test_client: AsyncClient, admin_token: str) -> dict:
    """Call the endpoint and return the decoded mapping."""
    response = await test_client.get(
        "/api/v1/projects/category-summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.api
@pytest.mark.asyncio
class TestProjectCategorySummary:
    """One aggregate response covering every active project."""

    async def test_route_is_not_shadowed_by_the_project_id_path(
        self, test_client: AsyncClient, admin_token: str
    ):
        """'category-summary' must not be parsed as a {project_id} int."""
        response = await test_client.get(
            "/api/v1/projects/category-summary",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), dict)

    async def test_totals_income_and_expense_per_category(
        self,
        test_client: AsyncClient,
        admin_token: str,
        default_category: int,
    ):
        """Income and expense for the same category land on one chart point."""
        project_id = await _create_project(test_client, admin_token, "Chart A")

        await _create_transaction(
            test_client, admin_token, project_id, default_category, INSIDE_CONTRACT, 100.0
        )
        await _create_transaction(
            test_client, admin_token, project_id, default_category, INSIDE_CONTRACT_LATER, 40.0
        )

        summary = await _fetch_summary(test_client, admin_token)

        points = summary[str(project_id)]
        assert len(points) == 1
        assert points[0]["income"] == 140.0
        assert points[0]["expense"] == 0.0

    async def test_keeps_projects_separate(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """Each project gets its own bucket - no cross-contamination."""
        first_id = await _create_project(test_client, admin_token, "Chart B")
        second_id = await _create_project(test_client, admin_token, "Chart C")

        await _create_transaction(
            test_client, admin_token, first_id, default_category, INSIDE_CONTRACT, 10.0
        )
        await _create_transaction(
            test_client, admin_token, second_id, default_category, INSIDE_CONTRACT, 99.0
        )

        summary = await _fetch_summary(test_client, admin_token)

        assert summary[str(first_id)][0]["income"] == 10.0
        assert summary[str(second_id)][0]["income"] == 99.0

    async def test_excludes_transactions_outside_the_contract_dates(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """Matches the date scoping /transactions/project/{id} applied."""
        project_id = await _create_project(test_client, admin_token, "Chart D")

        await _create_transaction(
            test_client, admin_token, project_id, default_category, INSIDE_CONTRACT, 50.0
        )
        # Outside the project's contract window.
        await _create_transaction(
            test_client, admin_token, project_id, default_category, BEFORE_CONTRACT, 777.0
        )

        summary = await _fetch_summary(test_client, admin_token)

        assert summary[str(project_id)][0]["income"] == 50.0

    async def test_project_without_transactions_is_absent(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Callers treat a missing key as an empty chart, so don't invent one."""
        project_id = await _create_project(test_client, admin_token, "Chart E")

        summary = await _fetch_summary(test_client, admin_token)

        assert str(project_id) not in summary
