import math

import pytest
from fastapi.testclient import TestClient

from app.main import GRID_STATE, MAX_POINTS, app, build_gda2020_grid_pipeline

client = TestClient(app)


def residual(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["epsgOperation"] == "8447"
    assert "gridLoaded" in data
    assert "gridFile" in data


def test_transform_mga94_zone_50():
    response = client.post(
        "/transform/export-coordinates",
        json={
            "sourceDatumFamily": "GDA94",
            "targetProjection": "EPSG:28350",
            "points": [{"lng": 116.027281614636, "lat": -31.86957386944}],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["accuracyStatus"] == "local-transform"
    assert data["pointCount"] == 1
    x, y = data["points"][0]
    assert 407000 < x < 409000
    assert 6473000 < y < 6475000


def test_transform_gda2020_fallback_or_grid_status():
    response = client.post(
        "/transform/export-coordinates",
        json={
            "sourceDatumFamily": "GDA94",
            "targetProjection": "EPSG:7850",
            "points": [{"lng": 116.027281614636, "lat": -31.86957386944}],
        },
    )
    assert response.status_code == 200
    data = response.json()
    if GRID_STATE.loaded:
        assert data["accuracyStatus"] == "official-grid"
        assert data["warning"] is None
        assert "EPSG:8447" in data["transform"]
    else:
        assert data["accuracyStatus"] == "approximate-fallback"
        assert "official NTv2 grid" in data["warning"]


@pytest.mark.skipif(not GRID_STATE.loaded, reason="official NTv2 grid is not installed")
def test_pcg2020_pipeline_forces_grid_before_projection():
    pipeline = build_gda2020_grid_pipeline("PCG2020")
    assert "+proj=hgridshift" in pipeline
    assert "+proj=tmerc" in pipeline
    assert pipeline.index("+proj=hgridshift") < pipeline.index("+proj=tmerc")


@pytest.mark.skipif(not GRID_STATE.loaded, reason="official NTv2 grid is not installed")
def test_pcg2020_control_point_residual_under_10mm():
    response = client.post(
        "/transform/export-coordinates",
        json={
            "sourceDatumFamily": "GDA94",
            "targetProjection": "PCG2020",
            "points": [{"lng": 116.027281614636, "lat": -31.86957386944}],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["accuracyStatus"] == "official-grid"
    actual = tuple(data["points"][0])
    expected = (69930.801, 372595.425)
    assert residual(actual, expected) < 0.01


def test_rejects_unknown_projection():
    response = client.post(
        "/transform/export-coordinates",
        json={
            "sourceDatumFamily": "GDA94",
            "targetProjection": "BAD",
            "points": [{"lng": 116, "lat": -32}],
        },
    )
    assert response.status_code == 422


def test_rejects_too_many_points():
    response = client.post(
        "/transform/export-coordinates",
        json={
            "sourceDatumFamily": "GDA94",
            "targetProjection": "EPSG:28350",
            "points": [{"lng": 116, "lat": -32}] * (MAX_POINTS + 1),
        },
    )
    assert response.status_code == 422
