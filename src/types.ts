export interface RawPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

export interface Visit {
  lat: number;
  lon: number;
  startTime: number;
  endTime: number;
  placeName?: string;
  placeId?: string;
}

export interface ImportResult {
  points: RawPoint[];
  visits: Visit[];
}

export interface VisitedFile {
  countries: string[];
  states: string[];
  cities: string[];
  updatedAt: number;
}

export interface RawTimelineImport {
  source: string;
  importedAt: number;
  visits: Visit[];
  points: RawPoint[];
}

export type LayerKind = "countries" | "states" | "cities";
