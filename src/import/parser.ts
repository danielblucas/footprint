import type { ImportResult, RawPoint, Visit } from "../types";

const E7 = 1e7;

function parseE7(value: number | string | undefined): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return undefined;
  return n / E7;
}

function parseGeo(geo: string | undefined): { lat: number; lon: number } | undefined {
  if (!geo) return undefined;
  const m = geo.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

function parseLatLng(s: string | undefined): { lat: number; lon: number } | undefined {
  if (!s) return undefined;
  const m = s.match(/(-?\d+(?:\.\d+)?)°?,\s*(-?\d+(?:\.\d+)?)°?/);
  if (!m) return undefined;
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

function parseTimestamp(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : t;
}

export function parseTimeline(raw: unknown): ImportResult {
  const points: RawPoint[] = [];
  const visits: Visit[] = [];

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    if (Array.isArray(obj.locations)) {
      parseRecordsFormat(obj.locations as unknown[], points);
    }

    if (Array.isArray(obj.timelineObjects)) {
      parseLegacySemantic(obj.timelineObjects as unknown[], points, visits);
    }

    if (Array.isArray(obj.semanticSegments)) {
      parseOnDeviceSegments(obj.semanticSegments as unknown[], points, visits);
    }

    if (Array.isArray(obj.rawSignals)) {
      parseRawSignals(obj.rawSignals as unknown[], points);
    }
  }

  if (Array.isArray(raw)) {
    parseOnDeviceSegments(raw as unknown[], points, visits);
  }

  return { points, visits };
}

function parseRecordsFormat(locations: unknown[], points: RawPoint[]): void {
  for (const item of locations) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const lat = parseE7(r.latitudeE7 as number);
    const lon = parseE7(r.longitudeE7 as number);
    const ts = parseTimestamp(r.timestamp as string) ??
      (typeof r.timestampMs === "string" ? Number(r.timestampMs) : undefined);
    if (lat != null && lon != null && ts != null) {
      points.push({ lat, lon, timestamp: ts });
    }
  }
}

function parseLegacySemantic(items: unknown[], points: RawPoint[], visits: Visit[]): void {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;

    if (o.placeVisit && typeof o.placeVisit === "object") {
      const pv = o.placeVisit as Record<string, unknown>;
      const loc = pv.location as Record<string, unknown> | undefined;
      const dur = pv.duration as Record<string, unknown> | undefined;
      const lat = parseE7(loc?.latitudeE7 as number);
      const lon = parseE7(loc?.longitudeE7 as number);
      const start = parseTimestamp(dur?.startTimestamp as string);
      const end = parseTimestamp(dur?.endTimestamp as string);
      if (lat != null && lon != null && start != null && end != null) {
        visits.push({
          lat,
          lon,
          startTime: start,
          endTime: end,
          placeName: loc?.name as string | undefined,
          placeId: loc?.placeId as string | undefined,
        });
      }
    }

    if (o.activitySegment && typeof o.activitySegment === "object") {
      const seg = o.activitySegment as Record<string, unknown>;
      const path = seg.simplifiedRawPath as Record<string, unknown> | undefined;
      const wp = path?.points as unknown[] | undefined;
      if (Array.isArray(wp)) {
        for (const p of wp) {
          if (!p || typeof p !== "object") continue;
          const pr = p as Record<string, unknown>;
          const lat = parseE7(pr.latE7 as number);
          const lon = parseE7(pr.lngE7 as number);
          const ts = parseTimestamp(pr.timestamp as string);
          if (lat != null && lon != null && ts != null) {
            points.push({ lat, lon, timestamp: ts });
          }
        }
      }
    }
  }
}

function parseOnDeviceSegments(items: unknown[], points: RawPoint[], visits: Visit[]): void {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const seg = item as Record<string, unknown>;

    const startTime = parseTimestamp(seg.startTime as string);
    const endTime = parseTimestamp(seg.endTime as string);

    if (seg.visit && typeof seg.visit === "object") {
      const visit = seg.visit as Record<string, unknown>;
      const tp = visit.topCandidate as Record<string, unknown> | undefined;
      const place = tp?.placeLocation as Record<string, unknown> | string | undefined;
      let coords: { lat: number; lon: number } | undefined;
      if (typeof place === "string") {
        coords = parseGeo(place);
      } else if (place && typeof place === "object") {
        coords = parseGeo((place as Record<string, unknown>).latLng as string);
      }
      if (coords && startTime != null && endTime != null) {
        visits.push({
          lat: coords.lat,
          lon: coords.lon,
          startTime,
          endTime,
          placeName: tp?.semanticType as string | undefined,
          placeId: tp?.placeId as string | undefined,
        });
      }
    }

    if (seg.timelinePath && Array.isArray(seg.timelinePath)) {
      for (const p of seg.timelinePath as unknown[]) {
        if (!p || typeof p !== "object") continue;
        const pr = p as Record<string, unknown>;
        const coords = parseLatLng(pr.point as string) ?? parseGeo(pr.point as string);
        const offsetMin = Number(pr.durationMinutesOffsetFromStartTime ?? 0);
        const ts = startTime != null ? startTime + offsetMin * 60_000 : undefined;
        if (coords && ts != null) {
          points.push({ lat: coords.lat, lon: coords.lon, timestamp: ts });
        }
      }
    }

    if (seg.activity && typeof seg.activity === "object") {
      const act = seg.activity as Record<string, unknown>;
      const start = act.start as Record<string, unknown> | string | undefined;
      const end = act.end as Record<string, unknown> | string | undefined;
      const startCoords = typeof start === "string"
        ? parseGeo(start)
        : start
          ? parseGeo((start as Record<string, unknown>).latLng as string)
          : undefined;
      const endCoords = typeof end === "string"
        ? parseGeo(end)
        : end
          ? parseGeo((end as Record<string, unknown>).latLng as string)
          : undefined;
      if (startCoords && startTime != null) {
        points.push({ lat: startCoords.lat, lon: startCoords.lon, timestamp: startTime });
      }
      if (endCoords && endTime != null) {
        points.push({ lat: endCoords.lat, lon: endCoords.lon, timestamp: endTime });
      }
    }
  }
}

function parseRawSignals(items: unknown[], points: RawPoint[]): void {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const pos = r.position as Record<string, unknown> | undefined;
    if (!pos) continue;
    const point = pos.point as string | undefined;
    const ts = parseTimestamp(pos.timestamp as string);
    const coords = parseGeo(point) ?? parseLatLng(point);
    if (coords && ts != null) {
      points.push({ lat: coords.lat, lon: coords.lon, timestamp: ts });
    }
  }
}
