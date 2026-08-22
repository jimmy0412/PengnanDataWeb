import json
from unittest.mock import patch

from app.services.pipeline import delete_year


def test_delete_year_removes_related_data_and_rebuilds_exports(tmp_path):
    raw_dir = tmp_path / "raw"
    processed_dir = tmp_path / "processed"
    map_dir = processed_dir / "map_layers"
    status_file = processed_dir / "status.json"
    catalog_file = map_dir / "catalog.json"
    (raw_dir / "110").mkdir(parents=True)
    (raw_dir / "110" / "110-m11.ods").touch()
    map_dir.mkdir(parents=True)

    for year in (109, 110):
        (processed_dir / f"cache_{year}.json").write_text(
            json.dumps({"age_structure": [], "indicators": []}), encoding="utf-8"
        )
    stale_export = processed_dir / "consolidated_age_109-110.ods"
    stale_export.touch()
    catalog_file.write_text(
        json.dumps(
            [
                {
                    "id": "derived-110",
                    "source_type": "processed_data",
                    "source_meta": {"year": 110},
                },
                {
                    "id": "uploaded",
                    "source_type": "csv",
                    "source_meta": {},
                },
            ]
        ),
        encoding="utf-8",
    )

    def fake_export(age, indicators, years):
        age_path = processed_dir / "consolidated_age_109.ods"
        indicator_path = processed_dir / "consolidated_indicators_109.ods"
        age_path.touch()
        indicator_path.touch()
        return age_path, indicator_path, "109"

    progress = []
    with (
        patch("app.services.pipeline.RAW_DIR", raw_dir),
        patch("app.services.pipeline.PROCESSED_DIR", processed_dir),
        patch("app.services.export_ods.PROCESSED_DIR", processed_dir),
        patch("app.config.STATUS_FILE", status_file),
        patch("app.services.map_layers.MAP_LAYERS_DIR", map_dir),
        patch("app.services.map_layers.MAP_LAYERS_CATALOG_FILE", catalog_file),
        patch("app.services.pipeline.export_consolidated", side_effect=fake_export),
    ):
        result = delete_year(110, progress=lambda *args: progress.append(args))

    assert not (raw_dir / "110").exists()
    assert not (processed_dir / "cache_110.json").exists()
    assert not stale_export.exists()
    assert result["processed_years"] == [109]
    assert result["removed_map_layers"] == 1
    assert [layer["id"] for layer in json.loads(catalog_file.read_text())] == [
        "uploaded"
    ]
    assert progress[-1] == ("刪除完成", 4, 4)


def test_delete_last_year_clears_exports_and_download_paths(tmp_path):
    raw_dir = tmp_path / "raw"
    processed_dir = tmp_path / "processed"
    map_dir = processed_dir / "map_layers"
    status_file = processed_dir / "status.json"
    processed_dir.mkdir()
    map_dir.mkdir()
    (processed_dir / "cache_114.json").write_text(
        json.dumps({"age_structure": [], "indicators": []}), encoding="utf-8"
    )
    old_export = processed_dir / "consolidated_age_114.ods"
    old_export.touch()

    with (
        patch("app.services.pipeline.RAW_DIR", raw_dir),
        patch("app.services.pipeline.PROCESSED_DIR", processed_dir),
        patch("app.services.export_ods.PROCESSED_DIR", processed_dir),
        patch("app.config.STATUS_FILE", status_file),
        patch("app.services.map_layers.MAP_LAYERS_DIR", map_dir),
        patch(
            "app.services.map_layers.MAP_LAYERS_CATALOG_FILE",
            map_dir / "catalog.json",
        ),
    ):
        result = delete_year(114)

    status = json.loads(status_file.read_text(encoding="utf-8"))
    assert result["processed_years"] == []
    assert result["ods_age_path"] is None
    assert status["ods_indicators_path"] is None
    assert not old_export.exists()
