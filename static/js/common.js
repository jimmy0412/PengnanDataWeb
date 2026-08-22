const COLOR_KEY = "penghu_population_colors";

const defaultColors = {
  male: "#3b82f6",
  female: "#ec4899",
  line: ["#1a6b8a", "#c2410c", "#15803d", "#7c3aed", "#b45309", "#be123c", "#0e7490"],
};

function loadColors() {
  try {
    return { ...defaultColors, ...JSON.parse(localStorage.getItem(COLOR_KEY) || "{}") };
  } catch {
    return { ...defaultColors };
  }
}

function saveColors(colors) {
  localStorage.setItem(COLOR_KEY, JSON.stringify(colors));
}

function getColors() {
  return loadColors();
}

function logTo(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent += `${new Date().toLocaleTimeString()} ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

async function fetchStatus() {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error("無法載入狀態");
  return res.json();
}

function fillYearSelect(selectId, years, { multiple = false, selectAll = false } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  years.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (multiple || selectAll) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!multiple && years.length) sel.value = String(years[years.length - 1]);
}

function selectedVillages(className = "village-cb") {
  return [...document.querySelectorAll(`.${className}:checked`)].map((el) => el.value);
}

function getMultiYears(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  return [...sel.selectedOptions].map((o) => parseInt(o.value, 10));
}

function fillYearCheckboxes(containerId, years, { checked = true } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  years.forEach((year) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "year-cb";
    input.value = year;
    input.checked = checked;
    label.append(input, ` ${year}`);
    container.appendChild(label);
  });
}

function getCheckedYears(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return [...container.querySelectorAll(".year-cb:checked")].map((input) =>
    parseInt(input.value, 10)
  );
}

function sortAgeGroups(groups) {
  return [...groups].sort((a, b) => {
    const aStart = parseInt(a.split("–")[0], 10);
    const bStart = parseInt(b.split("–")[0], 10);
    return bStart - aStart;
  });
}

function buildVillageParams(villages) {
  const params = new URLSearchParams();
  villages.forEach((v) => params.append("villages", v));
  return params;
}

async function initYearSelectsFromStatus(selectIds, { multiple = false } = {}) {
  try {
    const status = await fetchStatus();
    const years = status.processed_years || [];
    const ids = Array.isArray(selectIds) ? selectIds : [selectIds];
    ids.forEach((id) => fillYearSelect(id, years, { multiple, selectAll: multiple }));
    return status;
  } catch {
    return { processed_years: [] };
  }
}

async function initYearCheckboxesFromStatus(containerIds) {
  try {
    const status = await fetchStatus();
    const years = status.processed_years || [];
    const ids = Array.isArray(containerIds) ? containerIds : [containerIds];
    ids.forEach((id) => fillYearCheckboxes(id, years));
    return status;
  } catch {
    return { processed_years: [] };
  }
}
