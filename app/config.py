from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
SAMPLES_DIR = DATA_DIR / "samples"
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

STATISTICS_PAGE_URL = "https://www.penghu.gov.tw/makun/home.jsp?id=36"
FILE_BASE_URL = "https://www.penghu.gov.tw"

TARGET_VILLAGES = [
    "鐵線里",
    "嵵裡里",
    "風櫃里",
    "井垵里",
    "五德里",
    "鎖港里",
    "山水里",
]

ALL_VILLAGES_LABEL = "澎南區"

# Chart metric metadata: keys must match API field names in indicator records.
INDICATOR_METRICS = {
    "總人口": {"key": "總人口", "label": "總人口", "unit": "人", "y_axis": "人口數（人）"},
    "年出生": {"key": "年出生", "label": "年出生", "unit": "人", "y_axis": "出生人數（人）"},
    "年死亡": {"key": "年死亡", "label": "年死亡", "unit": "人", "y_axis": "死亡人數（人）"},
    "扶老比": {"key": "扶老比", "label": "扶老比", "unit": "%", "y_axis": "扶老比 (%)"},
    "出生率": {"key": "出生率", "label": "出生率", "unit": "‰", "y_axis": "出生率 (‰)"},
    "自然增加率": {
        "key": "自然增加率",
        "label": "自然增加率",
        "unit": "‰",
        "y_axis": "自然增加率 (‰)",
    },
}

LINE_CHART_METRICS = [
    INDICATOR_METRICS[key] for key in ("自然增加率", "出生率", "扶老比")
]

COMPARISON_CHART_METRICS = [
    INDICATOR_METRICS[key]
    for key in ("總人口", "年出生", "年死亡", "扶老比", "出生率", "自然增加率")
]

GENDER_LABELS = {"計": "全部", "男": "男", "女": "女"}

AGE_GROUPS = [f"{start}–{start + 4}" for start in range(0, 100, 5)]

STATUS_FILE = PROCESSED_DIR / "status.json"
MAP_LAYERS_DIR = PROCESSED_DIR / "map_layers"
MAP_LAYERS_CATALOG_FILE = MAP_LAYERS_DIR / "catalog.json"
