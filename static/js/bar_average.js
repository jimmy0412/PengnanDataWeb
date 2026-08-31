let comparisonChart = null;
let averageLineVisible = true;
let comparisonBarWidth = 0.7;
let focusedScaleEnabled = true;

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

const comparisonValueLabels = {
  id: "comparisonValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (!["bar", "line"].includes(dataset.type) || !chart.isDatasetVisible(datasetIndex)) return;
      const metadata = chart.getDatasetMeta(datasetIndex);
      metadata.data.forEach((element, dataIndex) => {
        const rawValue = dataset.data[dataIndex];
        if (rawValue == null || !Number.isFinite(Number(rawValue))) return;
        const value = Number(rawValue);
        const barValue = chart.data.datasets.find((item) => item.type === "bar")
          ?.data[dataIndex];
        const isBelow = dataset.type === "line"
          ? !Number.isFinite(Number(barValue)) || Number(barValue) >= 0
          : value < 0;
        const offset = dataset.type === "line" ? 9 : 6;
        const y = isBelow
          ? Math.min(chartArea.bottom - 14, element.y + offset)
          : Math.max(chartArea.top + 14, element.y - offset);

        ctx.save();
        ctx.fillStyle = dataset.type === "line" ? dataset.borderColor : "#1f2937";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 3;
        ctx.font = "600 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = isBelow ? "top" : "bottom";
        const label = formatComparisonValue(value);
        const halfWidth = ctx.measureText(label).width / 2;
        const x = Math.max(
          chartArea.left + halfWidth + 2,
          Math.min(chartArea.right - halfWidth - 2, element.x)
        );
        ctx.strokeText(label, x, y);
        ctx.fillText(label, x, y);
        ctx.restore();
      });
    });
  },
};

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
      legend: {
        position: "top",
        labels: {
          filter(legendItem) {
            return legendItem.text !== "七里平均" || averageLineVisible;
          },
        },
      },
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
        beginAtZero: !focusedScaleEnabled,
        grace: focusedScaleEnabled ? "10%" : 0,
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
      plugins: [comparisonValueLabels],
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

function updateFocusedScale() {
  focusedScaleEnabled = document.getElementById("comparison-focused-scale").checked;
  if (!comparisonChart) return;
  comparisonChart.options.scales.y.beginAtZero = !focusedScaleEnabled;
  comparisonChart.options.scales.y.grace = focusedScaleEnabled ? "10%" : 0;
  comparisonChart.update();
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
  document
    .getElementById("comparison-focused-scale")
    .addEventListener("change", updateFocusedScale);
  document.getElementById("comparison-years").addEventListener("change", (event) => {
    if (event.target.classList.contains("year-cb")) refreshComparisonChart();
  });
  ["comparison-village", "comparison-gender", "comparison-metric"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshComparisonChart);
  });

  const status = await initYearCheckboxesFromStatus("comparison-years");
  if (status.processed_years?.length) refreshComparisonChart();
});
