let comparisonChart = null;
let villageChart = null;
let dualChart = null;
let averageLineVisible = true;
let comparisonBarWidth = 0.7;
let focusedScaleEnabled = true;
const requestVersions = { comparison: 0, village: 0, dual: 0 };

const metrics = () => window.COMPARISON_CHART_METRICS || [];
const villages = () => window.VILLAGES || [];

function metricByKey(key) {
  return metrics().find((metric) => metric.key === key) || metrics()[0];
}

function selectedMetric(selectId) {
  return metricByKey(document.getElementById(selectId)?.value);
}

function checkedYears(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)]
    .map((input) => Number(input.value))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function customTitle(inputId, fallback) {
  return document.getElementById(inputId)?.value.trim() || fallback;
}

function setStatus(id, message) {
  const element = document.getElementById(id);
  if (element) element.textContent = message;
}

function formatComparisonValue(value, unit = "") {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const formatted = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 })
    .format(Number(value));
  return unit ? `${formatted} ${unit}` : formatted;
}

function rectanglesOverlap(left, right, padding = 3) {
  return !(
    left.right + padding <= right.left ||
    right.right + padding <= left.left ||
    left.bottom + padding <= right.top ||
    right.bottom + padding <= left.top
  );
}

function labelPlacement(ctx, chartArea, element, text, preferredDirection, occupied) {
  const width = ctx.measureText(text).width + 4;
  const height = 15;
  const verticalCandidates = [11, 24, 37].flatMap((distance) => [
    preferredDirection * distance,
    -preferredDirection * distance,
  ]);
  const horizontalCandidates = [0, -(width / 2 + 7), width / 2 + 7];
  let fallback = null;

  for (const xOffset of horizontalCandidates) {
    for (const yOffset of verticalCandidates) {
      const x = Math.max(
        chartArea.left + width / 2,
        Math.min(chartArea.right - width / 2, element.x + xOffset)
      );
      const y = Math.max(
        chartArea.top + height / 2,
        Math.min(chartArea.bottom - height / 2, element.y + yOffset)
      );
      const box = {
        left: x - width / 2,
        right: x + width / 2,
        top: y - height / 2,
        bottom: y + height / 2,
      };
      fallback = { x, y, box };
      if (!occupied.some((placed) => rectanglesOverlap(box, placed))) return fallback;
    }
  }
  return fallback;
}

const comparisonValueLabels = {
  id: "comparisonValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const occupied = [];
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const type = dataset.type || chart.config.type;
      if (!dataset.showValueLabels || !["bar", "line"].includes(type)) return;
      if (!chart.isDatasetVisible(datasetIndex)) return;
      const metadata = chart.getDatasetMeta(datasetIndex);
      metadata.data.forEach((element, dataIndex) => {
        const rawValue = dataset.data[dataIndex];
        if (rawValue == null || !Number.isFinite(Number(rawValue))) return;
        const value = Number(rawValue);
        const peerBar = chart.data.datasets.find((item) => (item.type || chart.config.type) === "bar");
        const peerValue = peerBar?.data[dataIndex];
        const preferredDirection = type === "line"
          ? (Number.isFinite(Number(peerValue)) && Number(peerValue) >= 0 ? 1 : -1)
          : (value < 0 ? 1 : -1);
        const label = formatComparisonValue(value, dataset.valueLabelUnit || "");

        ctx.save();
        ctx.font = "600 12px sans-serif";
        const placement = labelPlacement(
          ctx,
          chartArea,
          element,
          label,
          preferredDirection,
          occupied
        );
        if (!placement) {
          ctx.restore();
          return;
        }
        occupied.push(placement.box);
        ctx.fillStyle = dataset.valueLabelColor || dataset.borderColor || "#1f2937";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 3;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeText(label, placement.x, placement.y);
        ctx.fillText(label, placement.x, placement.y);
        ctx.restore();
      });
    });
  },
};

async function fetchJson(url, fallbackMessage) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.detail || fallbackMessage);
  return json;
}

async function fetchIndicatorComparison({ years, village, gender, metric }) {
  const params = new URLSearchParams({ village, gender, metric: metric.key });
  years.forEach((year) => params.append("years", year));
  return fetchJson(`/api/indicator-comparison?${params}`, "無法載入年度比較資料");
}

async function fetchIndicators(years, selectedVillages, gender) {
  const params = buildVillageParams(selectedVillages);
  years.forEach((year) => params.append("years", year));
  params.append("gender", gender);
  const result = await fetchJson(`/api/indicators?${params}`, "無法載入年度指標");
  return result.data;
}

function updateOrCreateChart(current, canvasId, data, options) {
  if (!current) {
    return new Chart(document.getElementById(canvasId), {
      type: "bar",
      data,
      options,
      plugins: [comparisonValueLabels],
    });
  }
  current.data = data;
  current.options = options;
  current.update();
  return current;
}

function comparisonSelections() {
  return {
    years: checkedYears("comparison-years"),
    village: document.getElementById("comparison-village").value,
    gender: document.getElementById("comparison-gender").value,
    metric: selectedMetric("comparison-metric"),
  };
}

function comparisonTitle(metric, village, gender) {
  return customTitle(
    "comparison-title",
    `${metric.label}：${village}與七里平均（${gender}）`
  );
}

function comparisonOptions(metric, village, gender) {
  return {
    responsive: true,
    devicePixelRatio: 5,
    maintainAspectRatio: false,
    backgroundColor: "#ffffff",
    layout: { padding: { top: 12, bottom: 12 } },
    plugins: {
      title: {
        display: true,
        text: comparisonTitle(metric, village, gender),
        padding: { top: 4, bottom: 20 },
        font: { size: 20, weight: "bold" },
      },
      legend: {
        position: "top",
        labels: {
          filter: (legendItem) => legendItem.text !== "七里平均" || averageLineVisible,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label(context) {
            const base = `${context.dataset.label}：${formatComparisonValue(context.parsed.y, metric.unit)}`;
            if (context.dataset.type !== "line") return base;
            const sampleSize = context.dataset.sampleSizes?.[context.dataIndex] ?? 0;
            return `${base}（n=${sampleSize}）`;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: "民國年" } },
      y: {
        beginAtZero: !focusedScaleEnabled,
        grace: focusedScaleEnabled ? "15%" : "8%",
        title: { display: true, text: metric.y_axis || metric.label },
      },
    },
  };
}

function renderComparisonChart(result, metric, colors) {
  const data = {
    labels: result.series.map((item) => String(item.year)),
    datasets: [
      {
        type: "bar",
        label: result.village,
        data: result.series.map((item) => item.village_value),
        backgroundColor: colors.comparisonBar,
        borderColor: colors.comparisonBar,
        valueLabelColor: "#1f2937",
        showValueLabels: true,
        barPercentage: comparisonBarWidth,
        order: 2,
      },
      {
        type: "line",
        label: "七里平均",
        data: result.series.map((item) => item.average),
        sampleSizes: result.series.map((item) => item.sample_size),
        borderColor: colors.comparisonAverage,
        backgroundColor: colors.comparisonAverage,
        valueLabelColor: colors.comparisonAverage,
        showValueLabels: true,
        borderWidth: 3,
        pointRadius: 4,
        tension: 0,
        spanGaps: false,
        hidden: !averageLineVisible,
        order: 1,
      },
    ],
  };
  comparisonChart = updateOrCreateChart(
    comparisonChart,
    "comparison-chart",
    data,
    comparisonOptions(metric, result.village, result.gender)
  );
  const averageIndex = comparisonChart.data.datasets.findIndex((item) => item.type === "line");
  comparisonChart.setDatasetVisibility(averageIndex, averageLineVisible);
  comparisonChart.update();
}

async function refreshComparisonChart() {
  const selections = comparisonSelections();
  if (!selections.metric) return;
  if (!selections.years.length) {
    setStatus("comparison-status", "請至少選擇一個年份。");
    return;
  }
  const version = ++requestVersions.comparison;
  setStatus("comparison-status", "載入中…");
  try {
    const result = await fetchIndicatorComparison(selections);
    if (version !== requestVersions.comparison) return;
    renderComparisonChart(result, selections.metric, getColors());
    setStatus("comparison-status", "");
  } catch (error) {
    if (version === requestVersions.comparison) setStatus("comparison-status", error.message);
  }
}

function villageSelections() {
  return {
    years: checkedYears("village-years"),
    gender: document.getElementById("village-gender").value,
    metric: selectedMetric("village-metric"),
  };
}

function villageTitle(metric, gender) {
  return customTitle("village-title", `${metric.label}多年份七里比較（${gender}）`);
}

function villageOptions(metric, gender) {
  return {
    responsive: true,
    devicePixelRatio: 5,
    maintainAspectRatio: false,
    backgroundColor: "#ffffff",
    layout: { padding: { top: 12, bottom: 12 } },
    plugins: {
      title: { display: true, text: villageTitle(metric, gender), font: { size: 20, weight: "bold" }, padding: { top: 4, bottom: 20 } },
      legend: { position: "top" },
      tooltip: { mode: "index", intersect: false, callbacks: { label: (context) => `${context.dataset.label}：${formatComparisonValue(context.parsed.y, metric.unit)}` } },
    },
    scales: {
      x: { stacked: false, title: { display: true, text: "民國年" } },
      y: { beginAtZero: true, grace: "12%", title: { display: true, text: metric.y_axis || metric.label } },
    },
  };
}

async function refreshVillageChart() {
  const selections = villageSelections();
  if (!selections.years.length) {
    setStatus("village-status", "請至少選擇一個年份。");
    return;
  }
  if (!selections.metric) {
    return;
  }
  const version = ++requestVersions.village;
  setStatus("village-status", "載入中…");
  try {
    const data = await fetchIndicators(selections.years, villages(), selections.gender);
    if (version !== requestVersions.village) return;
    const palette = getColors().line;
    const datasets = villages().map((village, index) => ({
      label: village,
      data: selections.years.map((year) => data.find(
        (row) => row.里 === village && Number(row.年份) === year
      )?.[selections.metric.key] ?? null),
      backgroundColor: palette[index % palette.length],
      borderColor: palette[index % palette.length],
      showValueLabels: true,
      valueLabelColor: "#1f2937",
      categoryPercentage: 0.82,
      barPercentage: 0.88,
      grouped: true,
    }));
    villageChart = updateOrCreateChart(
      villageChart,
      "village-chart",
      {
        labels: selections.years.map(String),
        datasets,
      },
      villageOptions(selections.metric, selections.gender)
    );
    const hasMissingValues = datasets.some((dataset) => dataset.data.some((value) => value == null));
    setStatus("village-status", hasMissingValues ? "部分年份或里別沒有資料。" : "");
  } catch (error) {
    if (version === requestVersions.village) setStatus("village-status", error.message);
  }
}

function dualSelections() {
  return {
    years: checkedYears("dual-years"),
    village: document.getElementById("dual-village").value,
    gender: document.getElementById("dual-gender").value,
  };
}

function dualTitle(village, gender) {
  return customTitle("dual-title", `出生率與扶老比歷年比較：${village}（${gender}）`);
}

function dualOptions(village, gender) {
  return {
    responsive: true,
    devicePixelRatio: 5,
    maintainAspectRatio: false,
    backgroundColor: "#ffffff",
    layout: { padding: { top: 12, bottom: 12 } },
    plugins: {
      title: { display: true, text: dualTitle(village, gender), font: { size: 20, weight: "bold" }, padding: { top: 4, bottom: 20 } },
      legend: { position: "top" },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label(context) {
            const unit = context.dataset.yAxisID === "yBirth" ? "‰" : "%";
            return `${context.dataset.label}：${formatComparisonValue(context.parsed.y, unit)}`;
          },
        },
      },
    },
    scales: {
      x: { stacked: false, title: { display: true, text: "民國年" } },
      yBirth: { type: "linear", position: "left", beginAtZero: true, grace: "12%", title: { display: true, text: "出生率 (‰)" } },
      yElderly: { type: "linear", position: "right", beginAtZero: true, grace: "12%", grid: { drawOnChartArea: false }, title: { display: true, text: "扶老比 (%)" } },
    },
  };
}

async function refreshDualChart() {
  const selections = dualSelections();
  if (!selections.years.length) {
    setStatus("dual-status", "請至少選擇一個年份。");
    return;
  }
  const version = ++requestVersions.dual;
  setStatus("dual-status", "載入中…");
  try {
    const rows = await fetchIndicators(selections.years, [selections.village], selections.gender);
    if (version !== requestVersions.dual) return;
    const byYear = new Map(rows.map((row) => [Number(row.年份), row]));
    const birthValues = selections.years.map((year) => byYear.get(year)?.出生率 ?? null);
    const elderlyValues = selections.years.map((year) => byYear.get(year)?.扶老比 ?? null);
    const colors = getColors();
    dualChart = updateOrCreateChart(
      dualChart,
      "dual-chart",
      {
        labels: selections.years.map(String),
        datasets: [
          {
            label: "出生率",
            data: birthValues,
            yAxisID: "yBirth",
            backgroundColor: colors.comparisonBar,
            borderColor: colors.comparisonBar,
            showValueLabels: true,
            valueLabelUnit: "‰",
            categoryPercentage: 0.72,
            barPercentage: 0.82,
            grouped: true,
          },
          {
            label: "扶老比",
            data: elderlyValues,
            yAxisID: "yElderly",
            backgroundColor: colors.comparisonAverage,
            borderColor: colors.comparisonAverage,
            showValueLabels: true,
            valueLabelUnit: "%",
            categoryPercentage: 0.72,
            barPercentage: 0.82,
            grouped: true,
          },
        ],
      },
      dualOptions(selections.village, selections.gender)
    );
    setStatus(
      "dual-status",
      [...birthValues, ...elderlyValues].some((value) => value == null) ? "部分年份沒有資料。" : ""
    );
  } catch (error) {
    if (version === requestVersions.dual) setStatus("dual-status", error.message);
  }
}

function updateComparisonTitle() {
  if (!comparisonChart) return;
  const { metric, village, gender } = comparisonSelections();
  comparisonChart.options.plugins.title.text = comparisonTitle(metric, village, gender);
  comparisonChart.update("none");
}

function updateVillageTitle() {
  if (!villageChart) return;
  const { metric, gender } = villageSelections();
  villageChart.options.plugins.title.text = villageTitle(metric, gender);
  villageChart.update("none");
}

function updateDualTitle() {
  if (!dualChart) return;
  const { village, gender } = dualSelections();
  dualChart.options.plugins.title.text = dualTitle(village, gender);
  dualChart.update("none");
}

function initComparisonColors() {
  const barInput = document.getElementById("comparison-bar-color");
  const averageInput = document.getElementById("comparison-average-color");
  const colors = getColors();
  barInput.value = colors.comparisonBar;
  averageInput.value = colors.comparisonAverage;
  barInput.addEventListener("input", () => {
    const updated = getColors();
    updated.comparisonBar = barInput.value;
    saveColors(updated);
    refreshComparisonChart();
    refreshDualChart();
  });
  averageInput.addEventListener("input", () => {
    const updated = getColors();
    updated.comparisonAverage = averageInput.value;
    saveColors(updated);
    refreshComparisonChart();
    refreshDualChart();
  });
}

function updateAverageLineVisibility() {
  averageLineVisible = document.getElementById("comparison-average-visible").checked;
  if (!comparisonChart) return;
  const averageIndex = comparisonChart.data.datasets.findIndex((dataset) => dataset.type === "line");
  comparisonChart.setDatasetVisibility(averageIndex, averageLineVisible);
  comparisonChart.options.plugins.legend.labels.filter =
    (legendItem) => legendItem.text !== "七里平均" || averageLineVisible;
  comparisonChart.update();
}

function updateComparisonBarWidth() {
  const input = document.getElementById("comparison-bar-width");
  comparisonBarWidth = Number(input.value) / 100;
  document.getElementById("comparison-bar-width-value").value = `${input.value}%`;
  if (!comparisonChart) return;
  const barDataset = comparisonChart.data.datasets.find((dataset) => dataset.type === "bar");
  if (barDataset) barDataset.barPercentage = comparisonBarWidth;
  comparisonChart.update("none");
}

function updateFocusedScale() {
  focusedScaleEnabled = document.getElementById("comparison-focused-scale").checked;
  if (!comparisonChart) return;
  comparisonChart.options.scales.y.beginAtZero = !focusedScaleEnabled;
  comparisonChart.options.scales.y.grace = focusedScaleEnabled ? "15%" : "8%";
  comparisonChart.update();
}

function comparisonExportBasename() {
  const { village, gender, metric } = comparisonSelections();
  return `年度長條比較_${metric?.label || "指標"}_${village}_${gender}`;
}

function villageExportBasename() {
  const { years, gender, metric } = villageSelections();
  return `七里比較_${years.join("-")}_${metric?.label || "指標"}_${gender}`;
}

function dualExportBasename() {
  const { village, gender } = dualSelections();
  return `出生率與扶老比_${village}_${gender}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  initComparisonColors();
  bindChartExportButtons(() => comparisonChart, comparisonExportBasename, '[data-chart="comparison"]');
  bindChartExportButtons(() => villageChart, villageExportBasename, '[data-chart="village"]');
  bindChartExportButtons(() => dualChart, dualExportBasename, '[data-chart="dual"]');

  document.getElementById("comparison-refresh").addEventListener("click", refreshComparisonChart);
  document.getElementById("comparison-average-visible").addEventListener("change", updateAverageLineVisibility);
  document.getElementById("comparison-bar-width").addEventListener("input", updateComparisonBarWidth);
  document.getElementById("comparison-focused-scale").addEventListener("change", updateFocusedScale);
  document.getElementById("comparison-years").addEventListener("change", refreshComparisonChart);
  ["comparison-village", "comparison-gender", "comparison-metric"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshComparisonChart);
  });
  document.getElementById("comparison-title").addEventListener("input", updateComparisonTitle);

  document.getElementById("village-refresh").addEventListener("click", refreshVillageChart);
  document.getElementById("village-years").addEventListener("change", refreshVillageChart);
  ["village-gender", "village-metric"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshVillageChart);
  });
  document.getElementById("village-title").addEventListener("input", updateVillageTitle);

  document.getElementById("dual-refresh").addEventListener("click", refreshDualChart);
  document.getElementById("dual-years").addEventListener("change", refreshDualChart);
  ["dual-village", "dual-gender"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshDualChart);
  });
  document.getElementById("dual-title").addEventListener("input", updateDualTitle);

  await initYearCheckboxesFromStatus(["comparison-years", "village-years", "dual-years"]);
  await Promise.all([refreshComparisonChart(), refreshVillageChart(), refreshDualChart()]);
});
