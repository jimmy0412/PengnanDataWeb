let lineChart = null;

const LINE_METRICS = () => window.LINE_CHART_METRICS || [];

const ALL_LABEL = () => window.ALL_VILLAGES_LABEL || "澎南區";

function lineColorOptions() {
  return [ALL_LABEL(), ...(window.VILLAGES || [])];
}

function selectedLineMetric() {
  const key = document.getElementById("line-metric")?.value;
  const metrics = LINE_METRICS();
  return metrics.find((m) => m.key === key) || metrics[0];
}

function lineChartTitle(metric, gender) {
  return `${metric.label}（${gender}，單位：${metric.unit}）`;
}

function applyLineColorInputs() {
  const colors = getColors();
  const container = document.getElementById("line-colors");
  container.innerHTML = "";
  const options = lineColorOptions();
  options.forEach((v, i) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = v;
    const input = document.createElement("input");
    input.type = "color";
    input.value = colors.line[i % colors.line.length];
    input.addEventListener("input", () => {
      const c = getColors();
      c.line[i] = input.value;
      saveColors(c);
      refreshLineChart();
    });
    wrap.append(label, input);
    container.appendChild(wrap);
  });
}

async function fetchIndicators(years, villages, gender) {
  const params = buildVillageParams(villages);
  years.forEach((y) => params.append("years", y));
  params.append("gender", gender);
  const res = await fetch(`/api/indicators?${params}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || "無法載入年度指標");
  return json.data;
}

function lineDatasets(years, villages, data, colors, metric) {
  const colorOptions = lineColorOptions();
  return villages.map((v) => {
    const idx = colorOptions.indexOf(v);
    const color = colors.line[(idx >= 0 ? idx : 0) % colors.line.length];
    return {
      label: v,
      data: years.map((y) => {
        const row = data.find(
          (r) => r.里 === v && Number(r.年份) === Number(y)
        );
        return row?.[metric.key] ?? null;
      }),
      borderColor: color,
      backgroundColor: color,
      tension: 0,
    };
  });
}

function lineChartOptions(metric, gender) {
  return {
    responsive: true,
    devicePixelRatio: 5,
    maintainAspectRatio: false,
    backgroundColor: "#ffffff",
    plugins: {
      title: {
        display: true,
        text: lineChartTitle(metric, gender),
        padding: { top: 4, bottom: 20 },
        font: { size: 20, weight: "bold" },
      },
      legend: { position: "top" },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label(ctx) {
            const v = ctx.parsed.y;
            const unit = metric.unit;
            return `${ctx.dataset.label}：${v == null ? "-" : `${v} ${unit}`}`;
          },
        },
      },
    },
    elements:{
      line:{
        tenstion: 0,
        borderWidth: 3,
      },
      point:{
        radius: 3,
      },
    },
    scales: {
      x: {
        title: { display: true, text: "民國年" },
      },
      y: {
        title: { display: true, text: metric.y_axis || metric.label },
      },
    },
  };
}

function lineChartConfig(years, villages, data, colors, metric, gender) {
  return {
    type: "line",
    data: {
      labels: years.map(String),
      datasets: lineDatasets(years, villages, data, colors, metric),
    },
    options: lineChartOptions(metric, gender),
  };
}

function updateLineChartTitle(metric, gender) {
  const titleEl = document.getElementById("line-chart-title");
  if (titleEl) titleEl.textContent = `${metric.label}折線圖`;
  if (!lineChart) return;
  lineChart.options.plugins.title.text = lineChartTitle(metric, gender);
}

function applyLineChartOptions(chart, metric, gender) {
  const opts = lineChartOptions(metric, gender);
  chart.options.plugins.title.text = opts.plugins.title.text;
  chart.options.plugins.tooltip.callbacks = opts.plugins.tooltip.callbacks;
  chart.options.scales.x.title = opts.scales.x.title;
  chart.options.scales.y.title = opts.scales.y.title;
}

function updateLineChart(years, villages, data, colors, metric, gender) {
  updateLineChartTitle(metric, gender);
  if (!lineChart) {
    const ctx = document.getElementById("line-chart");
    lineChart = new Chart(
      ctx,
      lineChartConfig(years, villages, data, colors, metric, gender)
    );
    return;
  }
  lineChart.data.labels = years.map(String);
  lineChart.data.datasets = lineDatasets(years, villages, data, colors, metric);
  applyLineChartOptions(lineChart, metric, gender);
  lineChart.update();
}

function clearLineChart() {
  if (!lineChart) return;
  lineChart.data.datasets = [];
  lineChart.update();
}

function refreshLineChart() {
  const years = getCheckedYears("chart-years");
  const villages = selectedVillages();
  const gender = document.getElementById("line-gender").value;
  const metric = selectedLineMetric();

  if (!metric) return;

  if (!years.length) {
    alert("請至少選擇一個年份。");
    return;
  }
  if (!villages.length) {
    clearLineChart();
    return;
  }

  fetchIndicators(years, villages, gender)
    .then((data) => {
      const colors = getColors();
      updateLineChart(years, villages, data, colors, metric, gender);
    })
    .catch((err) => alert(err.message));
}

function lineExportBasename() {
  const gender = document.getElementById("line-gender").value;
  const metric = selectedLineMetric();
  return `${metric?.label || "年度指標"}_${gender}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  applyLineColorInputs();
  bindChartExportButtons(() => lineChart, lineExportBasename);

  document.getElementById("btn-refresh").addEventListener("click", refreshLineChart);
  document.getElementById("line-gender").addEventListener("change", refreshLineChart);
  document.getElementById("line-metric").addEventListener("change", refreshLineChart);
  document.getElementById("chart-years").addEventListener("change", (e) => {
    if (e.target.classList.contains("year-cb")) refreshLineChart();
  });
  document.querySelector(".village-checks")?.addEventListener("change", (e) => {
    if (e.target.classList.contains("village-cb")) refreshLineChart();
  });

  const status = await initYearCheckboxesFromStatus("chart-years");
  if (status.processed_years?.length) refreshLineChart();
});
