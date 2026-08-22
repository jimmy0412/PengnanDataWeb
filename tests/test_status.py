import json
from unittest.mock import patch

from app.services.export_ods import list_cached_years, load_status


def test_status_recovers_years_from_existing_caches(tmp_path):
    status_file = tmp_path / "status.json"
    status_file.write_text(
        json.dumps({"processed_years": [109]}), encoding="utf-8"
    )
    for year in (109, 110, 114):
        (tmp_path / f"cache_{year}.json").write_text("{}", encoding="utf-8")
    (tmp_path / "cache_invalid.json").write_text("{}", encoding="utf-8")

    with (
        patch("app.services.export_ods.PROCESSED_DIR", tmp_path),
        patch("app.config.STATUS_FILE", status_file),
    ):
        assert list_cached_years() == [109, 110, 114]
        assert load_status()["processed_years"] == [109, 110, 114]


def test_status_recovers_cached_years_without_status_file(tmp_path):
    (tmp_path / "cache_109.json").write_text("{}", encoding="utf-8")

    with (
        patch("app.services.export_ods.PROCESSED_DIR", tmp_path),
        patch("app.config.STATUS_FILE", tmp_path / "missing-status.json"),
    ):
        assert load_status()["processed_years"] == [109]
