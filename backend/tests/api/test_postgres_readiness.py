import asyncio
import os

import pytest
from httpx2 import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app

POSTGRES_URL = os.environ.get("UNFOG_TEST_POSTGRES_URL")


@pytest.mark.skipif(not POSTGRES_URL, reason="requires disposable PostgreSQL integration DB")
def test_ready_endpoint_runs_select_against_postgres() -> None:
    assert POSTGRES_URL is not None
    app = create_app(
        Settings(
            database_url=POSTGRES_URL,
            app_env="test",
            readiness_timeout_seconds=2,
        )
    )

    async def get_readiness() -> int:
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                response = await client.get("/ready")
                assert response.json() == {"status": "ready"}
                return response.status_code

    assert asyncio.run(get_readiness()) == 200
