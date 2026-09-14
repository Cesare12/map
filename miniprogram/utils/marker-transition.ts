export const MARKER_TRANSITION_MS = 200;

export interface MarkerGroup {
  members: number[];
  marker: any;
}

export interface MarkerMove {
  marker: any;
  destination: { latitude: number; longitude: number };
  targetId: number;
}

/** 仅生成临时显示位置，不改地点的真实坐标。临时标记由调用方分配独立 ID。 */
export function planMarkerTransition(previous: MarkerGroup[], next: MarkerGroup[]) {
  const staticMarkers: any[] = [];
  const moves: MarkerMove[] = [];
  next.forEach((group) => {
    const memberIds = new Set(group.members);
    const sources = previous.filter((source) => source.members.some((id) => memberIds.has(id)));
    const unchanged = sources.length === 1 && sources[0].members.length === group.members.length &&
      sources[0].members.every((id) => memberIds.has(id));
    if (!sources.length || unchanged) {
      staticMarkers.push(group.marker);
      return;
    }
    sources.forEach((source) => {
      // 合并时保留来源图形靠拢；拆分时使用目标图形，从旧聚合位置展开。
      const merging = sources.length > 1 && source.members.every((id) => memberIds.has(id));
      const appearance = merging ? source.marker : group.marker;
      moves.push({
        marker: { ...appearance, latitude: source.marker.latitude, longitude: source.marker.longitude },
        destination: { latitude: group.marker.latitude, longitude: group.marker.longitude },
        targetId: group.marker.id
      });
    });
  });
  const hasMotion = moves.some((move) =>
    Math.abs(move.marker.latitude - move.destination.latitude) > 1e-8 ||
    Math.abs(move.marker.longitude - move.destination.longitude) > 1e-8
  );
  return { staticMarkers, moves, hasMotion };
}
