import asyncio
import json
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

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


def test_choropleth_csv_creates_single_series_equal_interval_layer(tmp_path):
    with patch.object(map_layers, "MAP_LAYERS_DIR", tmp_path), patch.object(map_layers, "MAP_LAYERS_CATALOG_FILE", tmp_path / "catalog.json"):
        layer = map_layers.create_map_layer_v2("人口面量圖", "choropleth", "里,人口\n鐵線里,-2\n鎖港里,8\n".encode())
    assert layer["kind"] == "choropleth"
    assert layer["visualization"] == {
        "type": "choropleth",
        "scale": "equal_interval",
        "classes": 5,
        "palette": map_layers.CHOROPLETH_COLORS,
    }
    assert len(layer["series"]) == 1
    assert next(iter(layer["values"]["鐵線里"].values())) == -2


def test_choropleth_csv_rejects_multiple_value_columns(tmp_path):
    with patch.object(map_layers, "MAP_LAYERS_DIR", tmp_path), patch.object(map_layers, "MAP_LAYERS_CATALOG_FILE", tmp_path / "catalog.json"):
        with pytest.raises(map_layers.MapLayerValidationError, match="一個數值欄位"):
            map_layers.create_map_layer_v2("多欄", "choropleth", "里,男,女\n鐵線里,1,2\n".encode())


def test_from_data_accepts_indicator_and_rejects_age(tmp_path):
    rows = [{"年份": 114, "里": village, "總人口": index + 1} for index, village in enumerate(map_layers.TARGET_VILLAGES)]
    with patch.object(map_layers, "MAP_LAYERS_DIR", tmp_path), patch.object(map_layers, "MAP_LAYERS_CATALOG_FILE", tmp_path / "catalog.json"), patch.object(map_layers, "query_indicators", return_value=rows):
        layer = map_layers.create_map_layer_from_data_v2("總人口面量圖", "choropleth", 114, "indicators", "全部", "總人口")
        assert layer["source"]["unit"] == "人"
        with pytest.raises(map_layers.MapLayerValidationError, match="indicators"):
            map_layers.create_map_layer_from_data_v2("年齡圖", "pie", 114, "age", "全部")


def test_color_patch_api_updates_layer_and_validates_errors(tmp_path):
    catalog = tmp_path / "catalog.json"
    with patch.object(map_layers, "MAP_LAYERS_DIR", tmp_path), patch.object(map_layers, "MAP_LAYERS_CATALOG_FILE", catalog):
        layer = map_layers.create_map_layer_v2("長條", "bar", "里,甲,乙\n鐵線里,1,2\n".encode())
        series_id = layer["series"][1]["id"]
        with patch("app.services.map_layers.MAP_LAYERS_DIR", tmp_path), patch("app.services.map_layers.MAP_LAYERS_CATALOG_FILE", catalog):
            response = send("PATCH", f"/api/v2/map-layers/{layer['id']}/colors", json={"colors": {series_id: "#abcdef"}})
            assert response.status_code == 200
            assert response.json()["layer"]["series"][1]["color"] == "#abcdef"
            assert send("PATCH", f"/api/v2/map-layers/{layer['id']}/colors", json={"colors": {"missing": "#123456"}}).status_code == 400
            assert send("PATCH", "/api/v2/map-layers/missing/colors", json={"colors": {series_id: "#123456"}}).status_code == 404


def test_choropleth_upload_api_rejects_multiple_columns():
    response = send("POST", "/api/v2/map-layers", data={"name": "多欄", "chart_type": "choropleth"}, files={"file": ("data.csv", "里,甲,乙\n鐵線里,1,2\n", "text/csv")})
    assert response.status_code == 400
    assert "一個數值欄位" in response.json()["detail"]


def test_v2_routes_and_react_map_template():
    with patch("app.main.load_catalog_v2", return_value={"schema_version": 2, "layers": []}):
        response = send("GET", "/api/v2/map-layers")
    assert response.json() == {"schema_version": 2, "layers": []}
    page = send("GET", "/map")
    assert 'id="map-react-root"' in page.text
    assert "/static/dist/map-app.js" in page.text
    assert "cdn.jsdelivr.net/npm/leaflet" not in page.text
