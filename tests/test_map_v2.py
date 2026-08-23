import asyncio
import json
from pathlib import Path
from unittest.mock import patch

import httpx

from app.main import app
from app.services import map_layers


def send(method, url, **kwargs):
    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, url, **kwargs)
    return asyncio.run(request())


def test_v1_catalog_migrates_with_backup_and_v2_shape(tmp_path):
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps([{"id": "old", "name": "舊", "chart_type": "bar", "series": ["人口"], "values": {"鐵線里": {"人口": 2}}}]), encoding="utf-8")
    with patch.object(map_layers, "MAP_LAYERS_DIR", tmp_path), patch.object(map_layers, "MAP_LAYERS_CATALOG_FILE", catalog):
        result = map_layers.load_catalog_v2()
    assert result["schema_version"] == 2
    assert result["layers"][0]["visualization"] == {"type": "bar", "scale": "global"}
    assert list(tmp_path.glob("catalog.v1.*.bak.json"))
    assert json.loads(catalog.read_text(encoding="utf-8"))["schema_version"] == 2


def test_pie_rejects_negative_csv(tmp_path):
    with patch.object(map_layers, "MAP_LAYERS_DIR", tmp_path), patch.object(map_layers, "MAP_LAYERS_CATALOG_FILE", tmp_path / "catalog.json"):
        try:
            map_layers.create_map_layer_v2("負值", "pie", "里,值\n鐵線里,-1\n".encode())
        except map_layers.MapLayerValidationError as error:
            assert "不可包含負值" in str(error)
        else:
            raise AssertionError("negative pie data was accepted")


def test_v2_routes_and_react_map_template():
    with patch("app.main.load_catalog_v2", return_value={"schema_version": 2, "layers": []}):
        response = send("GET", "/api/v2/map-layers")
    assert response.json() == {"schema_version": 2, "layers": []}
    page = send("GET", "/map")
    assert 'id="map-react-root"' in page.text
    assert "/static/dist/map-app.js" in page.text
    assert "cdn.jsdelivr.net/npm/leaflet" not in page.text
