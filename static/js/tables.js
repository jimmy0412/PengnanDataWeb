const AGE_COLUMNS = ["年份", "里", "性別", "年齡組", "人口數"];
const INDICATOR_COLUMNS = [
  "年份",
  "里",
  "性別",
  "總人口",
  "扶老比",
  "出生率",
  "自然增加率",
  "年出生",
  "年死亡",
];

const PIVOT_RATE_INDICATORS = new Set(["出生率", "扶老比"]);
const PIVOT_COUNT_INDICATORS = new Set(["總人口", "年出生"]);

function formatPivotCell(indicator, gender, value) {
  if (value == null || value === "") return "—";
  if (indicator === "扶老比") return `${value}%`;
  if (indicator === "出生率") return `${value} ‰`;
  if (PIVOT_COUNT_INDICATORS.has(indicator)) {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value;
}
function formatCell(col, value) {
  if (value == null || value === "") return "—";
  if (col === "扶老比") return `${value}%`;
  if (col === "出生率" || col === "自然增加率") return `${value} ‰`;
  if (col === "總人口" || col === "人口數" || col === "年出生" || col === "年死亡") {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value;
}

function pivotExportBasename() {
  const village = document.getElementById("pivot-village").value;
  return `年度指標_${village}`;
}

function detailExportBasename() {
  const type = document.getElementById("table-type").value;
  return type === "age" ? "年齡結構明細" : "年度指標明細";
}

function sortRows(rows, columns) {
  return [...rows].sort((a, b) => {
    for (const col of columns) {
      let av = a[col];
      let bv = b[col];
      if (col === "年份" || col === "人口數" || col === "總人口") {
        av = Number(av);
        bv = Number(bv);
      }
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  });
}

function renderDetailTable(rows, columns) {
  const table = document.getElementById("data-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  thead.innerHTML = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  tbody.innerHTML = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${formatCell(c, row[c])}</td>`).join("")}</tr>`
    )
    .join("");
}

function renderPivotTable(payload) {
  const table = document.getElementById("pivot-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const indicators = payload.indicators || [];

  const headerRow1 = `<tr><th rowspan="2">年份</th>${indicators
    .map((ind) => `<th colspan="2">${ind}</th>`)
    .join("")}</tr>`;
  const headerRow2 = `<tr>${indicators.map(() => `<th>男</th><th>女</th>`).join("")}</tr>`;
  thead.innerHTML = headerRow1 + headerRow2;

  tbody.innerHTML = (payload.rows || [])
    .map((row) => {
      const year = row["年份"];
      const cells = indicators
        .map((ind) => {
          const cell = row[ind] || {};
          return `<td>${formatPivotCell(ind, "男", cell["男"])}</td><td>${formatPivotCell(ind, "女", cell["女"])}</td>`;
        })
        .join("");
      return `<tr><th scope="row">${year}</th>${cells}</tr>`;
    })
    .join("");
}

async function loadPivotTable() {
  const years = getCheckedYears("pivot-years");
  const village = document.getElementById("pivot-village").value;
  const meta = document.getElementById("pivot-meta");

  if (!years.length) {
    meta.textContent = "請至少選擇一個年份。";
    return;
  }

  meta.textContent = "載入中…";
  const params = new URLSearchParams();
  years.forEach((y) => params.append("years", y));
  params.append("village", village);

  try {
    const res = await fetch(`/api/indicators-pivot?${params}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || "載入失敗");
    renderPivotTable(json);
    meta.textContent = `${village}：${years.length} 個年份 × ${json.indicators?.length || 0} 項指標（男/女）`;
  } catch (err) {
    meta.textContent = err.message;
    renderPivotTable({ indicators: [], rows: [] });
  }
}

async function loadDetailTable() {
  const type = document.getElementById("table-type").value;
  const years = getCheckedYears("table-years");
  const gender = document.getElementById("table-gender").value;
  const villages = selectedVillages();
  const meta = document.getElementById("table-meta");

  if (!years.length) {
    meta.textContent = "請至少選擇一個年份。";
    return;
  }
  if (!villages.length) {
    meta.textContent = "請至少選擇一個里別。";
    return;
  }

  meta.textContent = "載入中…";
  const params = buildVillageParams(villages);
  years.forEach((y) => params.append("years", y));
  params.append("gender", gender);

  const endpoint = type === "age" ? "/api/age-structure" : "/api/indicators";
  const columns = type === "age" ? AGE_COLUMNS : INDICATOR_COLUMNS;

  try {
    const res = await fetch(`${endpoint}?${params}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || "載入失敗");
    const sorted = sortRows(json.data, columns);
    renderDetailTable(sorted, columns);
    meta.textContent = `共 ${sorted.length} 筆（${type === "age" ? "年齡結構" : "年度指標"}）`;
  } catch (err) {
    meta.textContent = err.message;
    renderDetailTable([], columns);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  bindTableExportButtons({
    "pivot-table-wrap": pivotExportBasename,
    "detail-table-wrap": detailExportBasename,
  });

  document.getElementById("btn-load-pivot").addEventListener("click", loadPivotTable);
  document.getElementById("btn-load-table").addEventListener("click", loadDetailTable);
  document.getElementById("pivot-village").addEventListener("change", loadPivotTable);
  document.getElementById("table-type").addEventListener("change", loadDetailTable);
  document.getElementById("pivot-years").addEventListener("change", (e) => {
    if (e.target.classList.contains("year-cb")) loadPivotTable();
  });
  document.getElementById("table-years").addEventListener("change", (e) => {
    if (e.target.classList.contains("year-cb")) loadDetailTable();
  });

  const status = await initYearCheckboxesFromStatus(["pivot-years", "table-years"]);
  if (status.processed_years?.length) {
    loadPivotTable();
    loadDetailTable();
  }
});
