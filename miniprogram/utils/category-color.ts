export interface CategoryColorOption {
  key: string;
  name: string;
  hex: string;
  soft: string;
}

// 参考 iOS 系统色相，并为浅色地图和白色卡片加深，保证小尺寸图形有足够对比度。
export const CATEGORY_COLOR_OPTIONS: CategoryColorOption[] = [
  { key: "red", name: "红色", hex: "#D70015", soft: "#FFECEF" },
  { key: "orange", name: "橙色", hex: "#C93400", soft: "#FFF0E8" },
  { key: "yellow", name: "黄色", hex: "#9A6700", soft: "#FFF6D8" },
  { key: "green", name: "绿色", hex: "#248A3D", soft: "#EAF7ED" },
  { key: "teal", name: "青色", hex: "#007C83", soft: "#E5F7F7" },
  { key: "blue", name: "蓝色", hex: "#0071E3", soft: "#EAF3FF" },
  { key: "indigo", name: "靛青", hex: "#514BC3", soft: "#EFEEFF" },
  { key: "purple", name: "紫色", hex: "#8944AB", soft: "#F7ECFC" }
];

const COLOR_BY_KEY = new Map(CATEGORY_COLOR_OPTIONS.map((item) => [item.key, item]));

const LEGACY_COLOR_KEYS: Record<string, string> = {
  "#e36b4d": "orange",
  "#678b72": "green",
  "#527daa": "blue",
  "#8b6f9b": "purple",
  "#bd765f": "orange",
  "#6f8357": "green",
  "#936a9d": "purple",
  "#b48638": "yellow"
};

export function normalizeCategoryColorKey(value: unknown, legacyColor?: unknown): string {
  if (typeof value === "string" && COLOR_BY_KEY.has(value)) return value;
  if (typeof legacyColor === "string") return LEGACY_COLOR_KEYS[legacyColor.toLowerCase()] || "blue";
  return "blue";
}

export function categoryColor(key: string): CategoryColorOption {
  return COLOR_BY_KEY.get(normalizeCategoryColorKey(key)) || CATEGORY_COLOR_OPTIONS[5];
}
