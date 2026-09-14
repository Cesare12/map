export const CLUSTER_DISTANCE_PX = 72;
export const MAX_MAP_SCALE = 20;

interface Point {
  markerId: number;
  latitude: number;
  longitude: number;
}

export function projectPoint(point: { latitude: number; longitude: number }) {
  const latitude = Math.max(-85.051129, Math.min(85.051129, point.latitude));
  const sin = Math.sin(latitude * Math.PI / 180);
  return {
    x: ((point.longitude + 180) / 360 % 1 + 1) % 1,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  };
}

// 从当前可视经度跨度计算每个世界单位的屏幕像素，避免依赖地图 SDK 的瓦片尺寸。
// 地图固定俯视且不允许旋转，所以经度方向与屏幕水平方向一致。
export function worldSizeFromRegion(west: number, east: number, width: number): number | null {
  if (![west, east, width].every(Number.isFinite) || width <= 0) return null;
  const span = east > west ? east - west : east + 360 - west;
  if (span <= 0 || span > 360) return null;
  return width * 360 / span;
}

/** 最近的点对优先合并，且同一簇内任意两点都必须在阈值内，避免链式吸入远处地点。 */
export function clusterPlaces<T extends Point>(points: T[], worldSize: number, threshold = CLUSTER_DISTANCE_PX): T[][] {
  const sorted = points.slice().sort((a, b) => a.markerId - b.markerId);
  const positions = sorted.map(projectPoint);
  const distances: number[][] = sorted.map(() => []);
  const edges: { a: number; b: number; distance: number }[] = [];
  for (let a = 0; a < sorted.length; a++) {
    for (let b = a + 1; b < sorted.length; b++) {
      const deltaX = Math.abs(positions[a].x - positions[b].x);
      const dx = Math.min(deltaX, 1 - deltaX) * worldSize;
      const dy = (positions[a].y - positions[b].y) * worldSize;
      const distance = dx * dx + dy * dy;
      distances[a][b] = distances[b][a] = distance;
      if (distance <= threshold * threshold) edges.push({ a, b, distance });
    }
  }
  edges.sort((a, b) => a.distance - b.distance || a.a - b.a || a.b - b.b);
  const owner = sorted.map((_, index) => index);
  const members = sorted.map((_, index) => [index]);
  for (const edge of edges) {
    const a = owner[edge.a];
    const b = owner[edge.b];
    if (a === b) continue;
    if (!members[a].every((left) => members[b].every((right) => distances[left][right] <= threshold * threshold))) continue;
    members[b].forEach((index) => { owner[index] = a; });
    members[a].push(...members[b]);
    members[b] = [];
  }
  return members.filter((group) => group.length).map((group) => group.map((index) => sorted[index]));
}

export function clusterCenter(points: { latitude: number; longitude: number }[]) {
  const origin = points[0].longitude;
  const longitude = points.reduce((sum, point) => sum + ((point.longitude - origin + 540) % 360 - 180), 0) / points.length + origin;
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: (longitude + 540) % 360 - 180
  };
}
