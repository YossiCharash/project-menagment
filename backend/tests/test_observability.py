"""Tests for the ObservabilityInstrumentor wrapper.

These tests use an in-memory fake instrumentator so they exercise the
wrapper logic without depending on the real third-party package or any
network port.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI

from backend.core.exceptions.observability import (
    InstrumentationSetupError,
    InvalidApplicationInstanceError,
    MetricsEndpointExposeError,
)
from backend.core.observability import ObservabilityInstrumentor


class _FakeInstrumentator:
    """Minimal stand-in for prometheus_fastapi_instrumentator.Instrumentator."""

    def __init__(self) -> None:
        self.instrument_called_with: FastAPI | None = None
        self.expose_called_with_endpoint: str | None = None

    def instrument(self, application: FastAPI) -> "_FakeInstrumentator":
        self.instrument_called_with = application
        return self

    def expose(
        self,
        application: FastAPI,
        endpoint: str,
        include_in_schema: bool,
    ) -> None:
        self.expose_called_with_endpoint = endpoint


class _FailingInstrumentInstrumentator(_FakeInstrumentator):
    def instrument(self, application: FastAPI) -> "_FakeInstrumentator":
        raise RuntimeError("simulated instrument failure")


class _FailingExposeInstrumentator(_FakeInstrumentator):
    def expose(self, application: FastAPI, endpoint: str, include_in_schema: bool) -> None:
        raise RuntimeError("simulated expose failure")


def test_install_attaches_instrumentator_and_exposes_metrics_endpoint() -> None:
    application = FastAPI()
    fake = _FakeInstrumentator()
    instrumentor = ObservabilityInstrumentor(instrumentator_factory=lambda: fake)

    instrumentor.install(application)

    assert fake.instrument_called_with is application
    assert fake.expose_called_with_endpoint == "/metrics"


def test_install_rejects_non_fastapi_object() -> None:
    instrumentor = ObservabilityInstrumentor(
        instrumentator_factory=lambda: _FakeInstrumentator()
    )

    with pytest.raises(InvalidApplicationInstanceError):
        instrumentor.install("not-a-fastapi-app")  # type: ignore[arg-type]


def test_install_wraps_instrument_failure_in_setup_error() -> None:
    application = FastAPI()
    instrumentor = ObservabilityInstrumentor(
        instrumentator_factory=lambda: _FailingInstrumentInstrumentator()
    )

    with pytest.raises(InstrumentationSetupError):
        instrumentor.install(application)


def test_install_wraps_expose_failure_in_expose_error() -> None:
    application = FastAPI()
    instrumentor = ObservabilityInstrumentor(
        instrumentator_factory=lambda: _FailingExposeInstrumentator()
    )

    with pytest.raises(MetricsEndpointExposeError):
        instrumentor.install(application)
