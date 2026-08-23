import { DEFAULT_GENDER_COLORS } from "./visualization";

export function builtInLayers(genderColors = DEFAULT_GENDER_COLORS) {
  return [
    { id: "boundary", name: "實心區域底圖", kind: "boundary", visible: true },
    {
      id: "population",
      name: "人口圖表（男／女）",
      kind: "chart",
      visible: true,
      visualization: { type: "bar", scale: "global" },
      series: [
        { id: "male", name: "男", color: genderColors.male },
        { id: "female", name: "女", color: genderColors.female },
      ],
      values: {},
      source: { type: "processed_data" },
    },
    { id: "village-labels", name: "地名", kind: "labels", visible: true },
  ];
}

export function mergeLayers(custom = [], saved = [], current = [], genderColors = DEFAULT_GENDER_COLORS) {
  const builtIns = builtInLayers(genderColors);
  const currentPopulation = current.find((layer) => layer.id === "population");
  const population = currentPopulation
    ? { ...builtIns[1], values: currentPopulation.values || {} }
    : builtIns[1];
  const definitions = [builtIns[0], population, ...custom.map((layer) => ({ ...layer, shared: true, visible: true })), builtIns[2]];
  const byId = new Map(definitions.map((layer) => [layer.id, layer]));
  const visibility = new Map(saved.map((item) => [item.id, item.visible]));
  const ids = saved.map((item) => item.id).filter((id, index, all) => byId.has(id) && all.indexOf(id) === index);
  definitions.forEach((layer) => { if (!ids.includes(layer.id)) ids.push(layer.id); });
  return ids.map((id) => ({ ...byId.get(id), visible: visibility.has(id) ? visibility.get(id) : byId.get(id).visible }));
}

export function populationValues(rows) {
  return Object.fromEntries((rows || []).map((row) => [row.里, {
    male: Number(row.總人口?.男) || 0,
    female: Number(row.總人口?.女) || 0,
  }]));
}
