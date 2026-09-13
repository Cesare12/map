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

export function categoryIconPath(iconKey: string): string {
  return `/assets/category-icons/${normalizeCategoryIconKey(iconKey)}.png`;
}
