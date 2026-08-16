let pyramidChart = null;

function initPyramidColors() {
  const colors = getColors();
  document.getElementById("color-male").value = colors.male;
  document.getElementById("color-female").value = colors.female;
  document.getElementById("color-male").addEventListener("input", (e) => {
    const c = getColors();
    c.male = e.target.value;
    saveColors(c);
    refreshPyramid();
  });
  document.getElementById("color-female").addEventListener("input", (e) => {
    const c = getColors();
    c.female = e.target.value;
    saveColors(c);
    refreshPyramid();
  });
}

function pyramidExportBasename() {
  const year = document.getElementById("pyramid-year").value;
  const village = document.getElementById("pyramid-village").value;
  return `人口金字塔_${year}年_${village}`;
}

async function fetchAgePyramid(year, village) {
  const params = buildVillageParams([village]);
  params.append("years", year);
  params.append("gender", "男");
  const maleRes = await fetch(`/api/age-structure?${params}`);
  if (!maleRes.ok) throw new Error("無法載入男性年齡資料");
  const maleData = (await maleRes.json()).data;

  params.set("gender", "女");
  const femaleRes = await fetch(`/api/age-structure?${params}`);
  if (!femaleRes.ok) throw new Error("無法載入女性年齡資料");
  const femaleData = (await femaleRes.json()).data;
  return { maleData, femaleData };
}

function pyramidXAxisLimit(maleVals, femaleVals) {
  const maleMax = Math.max(0, ...maleVals.map((v) => Math.abs(v)));
  const femaleMax = Math.max(0, ...femaleVals.map((v) => Math.abs(v)));
  const allMax = Math.max(maleMax, femaleMax);
  return Math.ceil(allMax*1.05/10)*10;
}

function pyramidXScale(maleVals, femaleVals) {
  const limit = pyramidXAxisLimit(maleVals, femaleVals);
  return {
    stacked: true,
    title: { display: true, text: "人口數" },
    min: limit > 0 ? -limit : undefined,
    max: limit > 0 ? limit : undefined,
    ticks: {
      callback: (v) => Math.abs(v),
    },
  };
}

function pyramidChartConfig(year, village, groups, maleVals, femaleVals, colors) {
  return {
    type: "bar",
    data: {
      labels: groups,
      datasets: [
        {
          label: "男",
          data: maleVals,
          backgroundColor: colors.male,
          stack: "pyramid",
        },
        {
          label: "女",
          data: femaleVals,
          backgroundColor: colors.female,
          stack: "pyramid",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      devicePixelRatio: 5,
      maintainAspectRatio: false,
      backgroundColor: "#ffffff",
      plugins: {
        title: {
          display: true,
          text: `${year} 年度 ${village} 人口結構圖`,
          padding: { top: 4, bottom: 20 },
          font:{
            size: 20,
            weight: "bold",
          } 
        },
        legend: {
          position: "top",
        },
        tooltip: {
          mode: "index",
          axis: "y",
          intersect: false,
          callbacks: {
            label(ctx) {
              const v = Math.abs(ctx.parsed.x ?? ctx.raw ?? 0);
              return `${ctx.dataset.label}：${v} 人`;
            },
          },
        },
      },
      scales: {
        x: pyramidXScale(maleVals, femaleVals),
        y: {
          stacked: true,
          title: { display: true, text: "年齡組" },
        },
      },
    },
  };
}

function updatePyramidChart(year, village, groups, maleVals, femaleVals, colors) {
  const title = `${year} 年 ${village} 人口結構圖`;
  if (!pyramidChart) {
    const ctx = document.getElementById("pyramid-chart");
    pyramidChart = new Chart(ctx, pyramidChartConfig(year, village, groups, maleVals, femaleVals, colors));
    return;
  }
  pyramidChart.data.labels = groups;
  pyramidChart.data.datasets[0].data = maleVals;
  pyramidChart.data.datasets[0].backgroundColor = colors.male;
  pyramidChart.data.datasets[1].data = femaleVals;
  pyramidChart.data.datasets[1].backgroundColor = colors.female;
  pyramidChart.options.plugins.title.text = title;
  pyramidChart.options.scales.x = pyramidXScale(maleVals, femaleVals);
  pyramidChart.update();
}

function refreshPyramid() {
  const year = parseInt(document.getElementById("pyramid-year").value, 10);
  const village = document.getElementById("pyramid-village").value;
  if (!year || !village) return;

  fetchAgePyramid(year, village)
    .then(({ maleData, femaleData }) => {
      const colors = getColors();
      const groups = sortAgeGroups([...new Set(maleData.map((r) => r.年齡組))]);
      const maleMap = Object.fromEntries(maleData.map((r) => [r.年齡組, r.人口數]));
      const femaleMap = Object.fromEntries(femaleData.map((r) => [r.年齡組, r.人口數]));
      const maleVals = groups.map((g) => -(maleMap[g] || 0));
      const femaleVals = groups.map((g) => femaleMap[g] || 0);
      updatePyramidChart(year, village, groups, maleVals, femaleVals, colors);
    })
    .catch((err) => alert(err.message));
}

document.addEventListener("DOMContentLoaded", async () => {
  initPyramidColors();
  bindChartExportButtons(() => pyramidChart, pyramidExportBasename);

  document.getElementById("btn-refresh").addEventListener("click", refreshPyramid);
  ["pyramid-year", "pyramid-village"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshPyramid);
  });

  const status = await initYearSelectsFromStatus("pyramid-year");
  if (status.processed_years?.length) refreshPyramid();
});
