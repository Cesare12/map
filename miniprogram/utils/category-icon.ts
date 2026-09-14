import { normalizeCategoryColorKey } from "./category-color";

export interface CategoryIconOption {
  key: string;
  name: string;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { key: "food", name: "美食" },
  { key: "coffee", name: "咖啡" },
  { key: "pet", name: "宠物" },
  { key: "car", name: "汽车" },
  { key: "shopping", name: "购物" },
  { key: "sport", name: "运动" },
  { key: "outdoors", name: "户外" },
  { key: "entertainment", name: "娱乐" },
  { key: "service", name: "服务" },
  { key: "health", name: "健康" },
  { key: "sight", name: "景点" },
  { key: "other", name: "其他" }
];

const CATEGORY_ICON_KEYS = new Set(CATEGORY_ICON_OPTIONS.map((item) => item.key));

export function normalizeCategoryIconKey(value: unknown): string {
  return typeof value === "string" && CATEGORY_ICON_KEYS.has(value) ? value : "other";
}

export function categoryIconPath(iconKey: string, colorKey = "blue"): string {
  return `/assets/category-icons/${normalizeCategoryColorKey(colorKey)}-${normalizeCategoryIconKey(iconKey)}.png`;
}

export function normalizeCategorySymbolType(value: unknown): "icon" | "text" {
  return value === "text" ? "text" : "icon";
}

export function normalizeCategorySymbolText(value: unknown): string {
  const compact = Array.from(typeof value === "string" ? value.trim().replace(/\s+/g, "") : "");
  if (compact.length === 1 || compact.length === 2) {
    const candidate = compact.join("");
    if (/^[A-Za-z0-9]{1,2}$/.test(candidate)) return candidate;
  }
  if (compact.length === 1) {
    const first = compact[0];
    const code = first.codePointAt(0) || 0;
    if (code >= 0x3400 && code <= 0x9fff) return first;
  }
  return "";
}

export function categoryNameGlyph(name: unknown): string {
  const first = Array.from(typeof name === "string" ? name.trim() : "")[0] || "";
  return normalizeCategorySymbolText(first);
}
