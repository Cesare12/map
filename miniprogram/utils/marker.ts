import { normalizeCategoryIconKey } from "./category-icon";
import { normalizeCategoryColorKey } from "./category-color";

/**
 * 地图直接使用代码包中的可见图钉，避免运行时占位图在不同设备上被放大成色块。
 * 分类的 iconKey 决定内部图形，地点状态决定实心或描边外壳。
 */
export function markerIconPath(iconKey: string, colorKey: string, wantToVisit: boolean, usesText = false): string {
  const category = usesText ? "text" : normalizeCategoryIconKey(iconKey);
  const color = normalizeCategoryColorKey(colorKey);
  const state = wantToVisit ? "want" : "visited";
  return `/assets/markers/${color}-${category}-${state}.png`;
}

export function clusterIconPath(colorKey?: string): string {
  const color = colorKey ? normalizeCategoryColorKey(colorKey) : "mixed";
  return `/assets/clusters/${color}.png`;
}
