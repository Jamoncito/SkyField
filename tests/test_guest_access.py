from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Request, Response

from jupiter import api


def guest_request(origin="http://localhost:8080"):
    return Request({"type": "http", "headers": [(b"origin", origin.encode())]})


def test_guest_reuses_existing_session(monkeypatch):
    current = {"id": "existing", "name": "Visitor", "csrf": "existing-csrf"}
    monkeypatch.setattr(api, "engine", SimpleNamespace(begin=lambda: nullcontext(object())))
    monkeypatch.setattr(api.auth, "session", lambda *_args, **_kwargs: current)
    monkeypatch.setattr(api, "one", lambda *_args, **_kwargs: pytest.fail("Unexpected user creation"))
    assert api.guest(guest_request(), Response()) == current


def test_guest_creates_distinct_private_visitors(monkeypatch):
    created = []
    monkeypatch.setattr(api, "engine", SimpleNamespace(begin=lambda: nullcontext(object())))
    monkeypatch.setattr(api.auth, "session", lambda *_args, **_kwargs: None)

    def create_user(_conn, _sql, **values):
        created.append(values)
        return {"id": values["e"], "name": values["n"], "email": values["e"], "guide_seen": False}

    monkeypatch.setattr(api, "one", create_user)
    monkeypatch.setattr(api.auth, "start_session", lambda _conn, _request, _response, user: {**user, "csrf": "csrf"})
    first = api.guest(guest_request(), Response())
    second = api.guest(guest_request(), Response())
    assert first["id"] != second["id"]
    assert first["email"].endswith("@guest.skyfield.invalid")
    assert first["csrf"] == "csrf"
    assert first["guide_seen"] is False
    assert all(values["p"] == api.auth.DUMMY for values in created)


def test_guest_rejects_foreign_origin():
    with pytest.raises(HTTPException) as raised:
        api.guest(guest_request("https://foreign.invalid"), Response())
    assert raised.value.status_code == 403
