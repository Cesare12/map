import { CurrentLocation } from "./types";

const EARTH_RADIUS_METERS = 6371000;

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function distanceMeters(
  from: Pick<CurrentLocation, "latitude" | "longitude">,
  to: { latitude: number; longitude: number }
): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return "距离未知";
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} 米`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} 公里`;
  return `${Math.round(meters / 1000)} 公里`;
}

export function isInsideRegion(
  point: { latitude: number; longitude: number },
  southwest: { latitude: number; longitude: number },
  northeast: { latitude: number; longitude: number }
): boolean {
  return point.latitude >= southwest.latitude && point.latitude <= northeast.latitude &&
    point.longitude >= southwest.longitude && point.longitude <= northeast.longitude;
}
