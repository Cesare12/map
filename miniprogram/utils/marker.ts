import { normalizeCategoryIconKey } from "./category-icon";

/**
 * 地图直接使用代码包中的可见图钉，避免运行时占位图在不同设备上被放大成色块。
 * 分类的 iconKey 决定内部图形，地点状态决定实心或描边外壳。
 */
export function markerIconPath(iconKey: string, wantToVisit: boolean): string {
  const category = normalizeCategoryIconKey(iconKey);
  const state = wantToVisit ? "want" : "visited";
  return `/assets/markers/${category}-${state}.png`;
}
