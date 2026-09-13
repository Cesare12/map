import { Category, Place, Snapshot, Visit } from "./types";
import { normalizeCategoryIconKey } from "./category-icon";

const STORAGE_KEY = "want_to_go_map_snapshot_v1";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "美食", emoji: "🍜", iconKey: "food", color: "#E36B4D", builtIn: true },
  { id: "pet", name: "宠物", emoji: "🐾", iconKey: "pet", color: "#678B72", builtIn: true },
  { id: "car", name: "洗车", emoji: "🚗", iconKey: "car", color: "#527DAA", builtIn: true },
  { id: "other", name: "其他", emoji: "📍", iconKey: "other", color: "#8B6F9B", builtIn: true }
];

function cloneDefaults(): Category[] {
  return DEFAULT_CATEGORIES.map((item) => ({ ...item }));
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeVisits(value: unknown): Visit[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.id === "string" && validNumber(item.visitedAt))
    .map((item) => ({
      id: item.id,
      visitedAt: item.visitedAt,
      note: typeof item.note === "string" ? item.note : ""
    }));
}

function sanitizePlace(value: any, categoryIds: Set<string>): Place | null {
  if (!value || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (!validNumber(value.latitude) || !validNumber(value.longitude)) return null;
  const now = Date.now();
  const visits = sanitizeVisits(value.visits);
  return {
    id: value.id,
    name: value.name.trim() || "未命名地点",
    address: typeof value.address === "string" ? value.address : "",
    latitude: value.latitude,
    longitude: value.longitude,
    categoryId: categoryIds.has(value.categoryId) ? value.categoryId : "other",
    // 旧版本可能留下“既不想去、也没有到访记录”的第三种状态。
    // 迁移时归入种草，保证每个地点都明确属于种草或拔草。
    wantToVisit: value.wantToVisit !== false || visits.length === 0,
    visits,
    note: typeof value.note === "string" ? value.note : "",
    createdAt: validNumber(value.createdAt) ? value.createdAt : now,
    updatedAt: validNumber(value.updatedAt) ? value.updatedAt : now
  };
}

export function loadSnapshot(): Snapshot {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || raw.schemaVersion !== 1) {
      return { schemaVersion: 1, categories: cloneDefaults(), places: [], updatedAt: Date.now() };
    }
    const customCategories = Array.isArray(raw.categories)
      ? raw.categories.filter((item: any) =>
          item && typeof item.id === "string" && typeof item.name === "string" &&
          typeof item.emoji === "string" && typeof item.color === "string"
        ).map((item: any) => ({
          ...item,
          iconKey: normalizeCategoryIconKey(item.iconKey || item.id)
        }))
      : [];
    const byId = new Map<string, Category>();
    cloneDefaults().concat(customCategories).forEach((item) => byId.set(item.id, item));
    const categories = Array.from(byId.values());
    const ids = new Set(categories.map((item) => item.id));
    const places = Array.isArray(raw.places)
      ? raw.places.map((item: any) => sanitizePlace(item, ids)).filter(Boolean) as Place[]
      : [];
    return { schemaVersion: 1, categories, places, updatedAt: Date.now() };
  } catch (error) {
    console.warn("读取本地数据失败", error);
    return { schemaVersion: 1, categories: cloneDefaults(), places: [], updatedAt: Date.now() };
  }
}

export function saveSnapshot(snapshot: Snapshot): void {
  const next = { ...snapshot, updatedAt: Date.now() };
  wx.setStorageSync(STORAGE_KEY, next);
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addCategory(name: string, iconKey = "other", emoji = "🏷️"): Category {
  const snapshot = loadSnapshot();
  const trimmed = name.trim().slice(0, 8);
  const duplicate = snapshot.categories.find((item) => item.name === trimmed);
  if (duplicate) return duplicate;
  const colors = ["#BD765F", "#527DAA", "#6F8357", "#936A9D", "#B48638"];
  const category: Category = {
    id: createId("category"),
    name: trimmed,
    emoji,
    iconKey: normalizeCategoryIconKey(iconKey),
    color: colors[snapshot.categories.length % colors.length],
    builtIn: false
  };
  snapshot.categories.push(category);
  saveSnapshot(snapshot);
  return category;
}

export function setCategoryIcon(categoryId: string, iconKey: string): Category | null {
  const snapshot = loadSnapshot();
  const category = snapshot.categories.find((item) => item.id === categoryId);
  if (!category) return null;
  category.iconKey = normalizeCategoryIconKey(iconKey);
  saveSnapshot(snapshot);
  return category;
}

export function upsertPlace(place: Place): void {
  const snapshot = loadSnapshot();
  const index = snapshot.places.findIndex((item) => item.id === place.id);
  if (index >= 0) snapshot.places[index] = place;
  else snapshot.places.push(place);
  saveSnapshot(snapshot);
}

export function removePlace(id: string): void {
  const snapshot = loadSnapshot();
  snapshot.places = snapshot.places.filter((item) => item.id !== id);
  saveSnapshot(snapshot);
}

export function recordVisit(id: string): Place | null {
  const snapshot = loadSnapshot();
  const place = snapshot.places.find((item) => item.id === id);
  if (!place) return null;
  place.visits.push({ id: createId("visit"), visitedAt: Date.now(), note: "" });
  place.wantToVisit = false;
  place.updatedAt = Date.now();
  saveSnapshot(snapshot);
  return place;
}

export function setWantToVisit(id: string, value: boolean): Place | null {
  const snapshot = loadSnapshot();
  const place = snapshot.places.find((item) => item.id === id);
  if (!place) return null;
  place.wantToVisit = value;
  place.updatedAt = Date.now();
  saveSnapshot(snapshot);
  return place;
}

export function exportSnapshotText(): string {
  return JSON.stringify(loadSnapshot(), null, 2);
}
