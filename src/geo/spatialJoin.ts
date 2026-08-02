import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { distance } from "@turf/distance";
import { point as turfPoint } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon, Point } from "geojson";
import type { RawPoint, Visit } from "../types";
import {
  loadCountries,
  loadStates,
  loadCities,
  countryIso,
  stateIso,
  cityId,
  cityName,
} from "./datasets";
import type { HomePoint } from "../types";

interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function bboxOf(geom: Polygon | MultiPolygon): BBox {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, minLat, maxLon, maxLat };
}

function inBBox(lat: number, lon: number, b: BBox): boolean {
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
}

interface PolyIndex {
  features: Feature<Polygon | MultiPolygon>[];
  bboxes: BBox[];
}

function buildIndex(fc: FeatureCollection<Polygon | MultiPolygon>): PolyIndex {
  const bboxes = fc.features.map((f) => bboxOf(f.geometry));
  return { features: fc.features, bboxes };
}

function findContaining(index: PolyIndex, lat: number, lon: number): Feature<Polygon | MultiPolygon> | null {
  const pt = turfPoint([lon, lat]);
  for (let i = 0; i < index.features.length; i++) {
    if (!inBBox(lat, lon, index.bboxes[i])) continue;
    if (booleanPointInPolygon(pt, index.features[i])) return index.features[i];
  }
  return null;
}

function findNearestCity(cities: FeatureCollection<Point>, lat: number, lon: number, maxKm = 25): Feature<Point> | null {
  const pt = turfPoint([lon, lat]);
  let best: Feature<Point> | null = null;
  let bestD = Infinity;
  for (const city of cities.features) {
    const [clon, clat] = (city.geometry as Point).coordinates;
    const dlat = clat - lat;
    const dlon = clon - lon;
    // Cheap degree-window prefilter before the costlier great-circle distance.
    // Two known blind spots, accepted deliberately: plain degree subtraction
    // wrongly rejects a pair straddling the ±180° meridian (Δlon computes as
    // ~360 rather than ~0), and above ~81° latitude 1.5° of longitude narrows to
    // less than the 25 km match radius, so genuinely close cities get dropped.
    // Cost is at most a missed city dot — the country and state joins don't use
    // this prefilter, so those still light up. Swap in a latitude-scaled window
    // (and a wrapped Δlon) if the Pacific or the high Arctic ever matter here.
    if (Math.abs(dlat) > 1 || Math.abs(dlon) > 1.5) continue;
    const d = distance(pt, city, { units: "kilometers" });
    if (d < bestD) {
      bestD = d;
      best = city;
    }
  }
  return bestD <= maxKm ? best : null;
}

/**
 * Snap an arbitrary point to the nearest dataset city, returning that city's
 * centroid + name as a HomePoint. Uncapped (unlike the 25 km import match) so a
 * home click always resolves to *some* city — the snap is what coarsens the
 * stored coordinate to a public, city-level location. Full scan over ~7,300
 * cities, which is instant for a one-off click.
 */
export async function nearestCity(lat: number, lon: number): Promise<HomePoint | null> {
  const cities = await loadCities();
  const pt = turfPoint([lon, lat]);
  let best: Feature<Point> | null = null;
  let bestD = Infinity;
  for (const city of cities.features) {
    const d = distance(pt, city, { units: "kilometers" });
    if (d < bestD) {
      bestD = d;
      best = city;
    }
  }
  if (!best) return null;
  const [clon, clat] = (best.geometry as Point).coordinates;
  return { lat: clat, lon: clon, label: cityName(best) };
}

export interface JoinedResult {
  visitedCountries: Set<string>;
  visitedStates: Set<string>;
  visitedCities: Set<string>;
}

/**
 * Resolve every coordinate in an import to the country/state/city it belongs to.
 *
 * Both buckets the parser produces have to be joined. `visits` ("was at this
 * place from 2pm to 4pm") only exist in the Semantic and on-device formats;
 * the legacy Takeout Records export — and `rawSignals`, and the waypoints of
 * legacy `activitySegment`s — yield *only* `points`. Joining visits alone made
 * a Records import a silent no-op that still reported success.
 */
export async function joinVisits(visits: Visit[], points: RawPoint[] = []): Promise<JoinedResult> {
  const [countries, states, cities] = await Promise.all([
    loadCountries(),
    loadStates(),
    loadCities(),
  ]);
  const countryIdx = buildIndex(countries);
  const stateIdx = buildIndex(states);

  const visitedCountries = new Set<string>();
  const visitedStates = new Set<string>();
  const visitedCities = new Set<string>();

  // Timeline exports contain the same places over and over (every trip home is
  // a visit). Coordinates inside one bucket resolve to the same
  // country/state/city, so join each bucket once — typically an order of
  // magnitude fewer polygon scans on a real export.
  const seen = new Set<string>();
  const join = (lat: number, lon: number, precision: number): void => {
    const key = `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const country = findContaining(countryIdx, lat, lon);
    const state = findContaining(stateIdx, lat, lon);
    const city = findNearestCity(cities, lat, lon);

    if (country) visitedCountries.add(countryIso(country));
    if (state) visitedStates.add(stateIso(state));
    if (city) visitedCities.add(cityId(city));
  };

  // Visits bucket at ~110 m. Points are raw GPS breadcrumbs — vastly more
  // numerous (a Records export runs to six figures) and individually far less
  // meaningful — so they bucket at ~1.1 km, which bounds the polygon scans
  // without costing anything at country/region/25 km-city resolution. The two
  // precisions produce different key strings, so each bucket set is effectively
  // its own namespace; the overlap is a few redundant scans, not wrong results.
  for (const v of visits) join(v.lat, v.lon, 3);
  for (const p of points) join(p.lat, p.lon, 2);

  return { visitedCountries, visitedStates, visitedCities };
}
