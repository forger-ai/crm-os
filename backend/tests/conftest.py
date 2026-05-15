from __future__ import annotations

import os
import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))


@pytest.fixture
def client() -> Iterator:
    """Spawn a fully isolated FastAPI test client with an empty SQLite DB.

    Each test gets its own DATABASE_URL pointing at a fresh tempfile, then
    we re-import the database/database_ext modules so the engine binds to it.
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    tmp.close()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp.name}"

    # Pop everything that reads or holds a reference to the engine, but keep
    # `app.models` cached: SQLModel registers tables on a global metadata at
    # import time, and re-importing the module would try to re-define them.
    for mod in [
        "app.main",
        "app.database",
        "app.database_ext",
        "app.health",
        "app.cors",
    ]:
        sys.modules.pop(mod, None)
    for key in list(sys.modules.keys()):
        if key.startswith("app.routers") or key.startswith("app.services"):
            sys.modules.pop(key, None)

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

    try:
        os.unlink(tmp.name)
    except OSError:
        pass
