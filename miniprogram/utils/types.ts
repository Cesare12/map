export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  builtIn: boolean;
}

export interface Visit {
  id: string;
  visitedAt: number;
  note?: string;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  categoryId: string;
  wantToVisit: boolean;
  visits: Visit[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  schemaVersion: 1;
  categories: Category[];
  places: Place[];
  updatedAt: number;
}

export interface CurrentLocation {
  latitude: number;
  longitude: number;
  updatedAt: number;
}
