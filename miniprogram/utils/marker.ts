const BUILT_IN_MARKER_KEYS = new Set(["food", "pet", "car", "other"]);

/**
 * 地图直接使用代码包中的可见图钉，避免运行时占位图在不同设备上被放大成色块。
 * 自定义分类复用“其他”图标；分类名称仍会在筛选栏和地点卡片中完整显示。
 */
export function markerIconPath(categoryId: string, wantToVisit: boolean): string {
  const category = BUILT_IN_MARKER_KEYS.has(categoryId) ? categoryId : "other";
  const state = wantToVisit ? "want" : "visited";
  return `/assets/markers/${category}-${state}.png`;
}
