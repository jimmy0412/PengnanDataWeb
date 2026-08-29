let comparisonChart = null;
let averageLineVisible = true;
let comparisonBarWidth = 0.7;

function selectedComparisonMetric() {
  const key = document.getElementById("comparison-metric")?.value;
  const metrics = window.COMPARISON_CHART_METRICS || [];
  return metrics.find((metric) => metric.key === key) || metrics[0];
}

function comparisonSelections() {
  return {
    years: getCheckedYears("comparison-years"),
    village: document.getElementById("comparison-village").value,
    gender: document.getElementById("comparison-gender").value,
    metric: selectedComparisonMetric(),
  };
}

async function fetchIndicatorComparison({ years, village, gender, metric }) {
  const params = new URLSearchParams({ village, gender, metric: metric.key });
  years.forEach((year) => params.append("years", year));
  const response = await fetch(`/api/indicator-comparison?${params}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.detail || "無法載入年度比較資料");
  return json;
}

function formatComparisonValue(value, unit) {
  if (value == null) return "-";
  const formatted = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function comparisonTitle(metric, village, gender) {
  return `${metric.label}：${village}與七里平均（${gender}）`;
}

function comparisonDatasets(result, colors) {
  return [
    {
      type: "bar",
      label: result.village,
      data: result.series.map((item) => item.village_value),
      backgroundColor: colors.comparisonBar,
      borderColor: colors.comparisonBar,
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
      borderWidth: 3,
      pointRadius: 4,
      tension: 0,
      spanGaps: false,
      hidden: !averageLineVisible,
      order: 1,
    },
  ];
}

function comparisonOptions(metric, village, gender) {
  return {
    responsive: true,
    devicePixelRatio: 5,
    maintainAspectRatio: false,
    backgroundColor: "#ffffff",
    plugins: {
      title: {
        display: true,
        text: comparisonTitle(metric, village, gender),
        padding: { top: 4, bottom: 20 },
        font: { size: 20, weight: "bold" },
      },
      legend: { position: "top" },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label(context) {
            const value = context.parsed.y;
            const base = `${context.dataset.label}：${formatComparisonValue(value, metric.unit)}`;
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
        beginAtZero: true,
        title: { display: true, text: metric.y_axis || metric.label },
      },
    },
  };
}

function renderComparisonChart(result, metric, colors) {
  const labels = result.series.map((item) => String(item.year));
  const datasets = comparisonDatasets(result, colors);
  const options = comparisonOptions(metric, result.village, result.gender);
  document.getElementById("comparison-chart-heading").textContent = `${metric.label}歷年比較`;

  if (!comparisonChart) {
    comparisonChart = new Chart(document.getElementById("comparison-chart"), {
      type: "bar",
      data: { labels, datasets },
      options,
    });
    return;
  }
  comparisonChart.data.labels = labels;
  comparisonChart.data.datasets = datasets;
  comparisonChart.options = options;
  const averageIndex = comparisonChart.data.datasets.findIndex(
    (dataset) => dataset.type === "line"
  );
  if (averageIndex >= 0) {
    comparisonChart.setDatasetVisibility(averageIndex, averageLineVisible);
  }
  comparisonChart.update();
}

async function refreshComparisonChart() {
  const selections = comparisonSelections();
  if (!selections.metric) return;
  if (!selections.years.length) {
    alert("請至少選擇一個年份。");
    return;
  }

  try {
    const result = await fetchIndicatorComparison(selections);
    renderComparisonChart(result, selections.metric, getColors());
  } catch (error) {
    alert(error.message);
  }
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
  });
  averageInput.addEventListener("input", () => {
    const updated = getColors();
    updated.comparisonAverage = averageInput.value;
    saveColors(updated);
    refreshComparisonChart();
  });
}

function updateAverageLineVisibility() {
  averageLineVisible = document.getElementById("comparison-average-visible").checked;
  if (!comparisonChart) return;
  const averageIndex = comparisonChart.data.datasets.findIndex(
    (dataset) => dataset.type === "line"
  );
  if (averageIndex >= 0) {
    comparisonChart.setDatasetVisibility(averageIndex, averageLineVisible);
  }
  comparisonChart.update();
}

function updateComparisonBarWidth() {
  const input = document.getElementById("comparison-bar-width");
  const output = document.getElementById("comparison-bar-width-value");
  comparisonBarWidth = Number(input.value) / 100;
  output.value = `${input.value}%`;
  if (!comparisonChart) return;
  const barDataset = comparisonChart.data.datasets.find(
    (dataset) => dataset.type === "bar"
  );
  if (barDataset) barDataset.barPercentage = comparisonBarWidth;
  comparisonChart.update("none");
}

function comparisonExportBasename() {
  const { village, gender, metric } = comparisonSelections();
  return `年度長條比較_${metric?.label || "指標"}_${village}_${gender}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  initComparisonColors();
  bindChartExportButtons(() => comparisonChart, comparisonExportBasename);
  document.getElementById("comparison-refresh").addEventListener("click", refreshComparisonChart);
  document
    .getElementById("comparison-average-visible")
    .addEventListener("change", updateAverageLineVisibility);
  document
    .getElementById("comparison-bar-width")
    .addEventListener("input", updateComparisonBarWidth);
  document.getElementById("comparison-years").addEventListener("change", (event) => {
    if (event.target.classList.contains("year-cb")) refreshComparisonChart();
  });
  ["comparison-village", "comparison-gender", "comparison-metric"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshComparisonChart);
  });

  const status = await initYearCheckboxesFromStatus("comparison-years");
  if (status.processed_years?.length) refreshComparisonChart();
});
