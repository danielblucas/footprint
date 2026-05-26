import maplibregl, { type Map as MlMap } from "maplibre-gl";
import type { FeatureCollection, Feature, Polygon, MultiPolygon, Point } from "geojson";
import { loadCountries, loadStates, loadCities, countryIso, stateIso, cityId } from "../geo/datasets";
import type { LayerKind } from "../types";

interface LayerState {
  visitedCountries: Set<string>;
  visitedStates: Set<string>;
  visitedCities: Set<string>;
}

let currentLayer: LayerKind = "countries";

const VISITED_FILL = "#CC6B49";
const VISITED_OUTLINE = "#A85436";
const NOT_VISITED_FILL = "#1E5F8A";
const NOT_VISITED_OUTLINE = "#3D7BA8";

function tagVisited<T extends Feature<Polygon | MultiPolygon> | Feature<Point>>(
  features: T[],
  visited: Set<string>,
  getId: (f: Feature) => string,
): T[] {
  return features.map((f) => ({
    ...f,
    properties: { ...(f.properties ?? {}), visited: visited.has(getId(f)) ? 1 : 0 },
  }));
}

export async function initLayers(map: MlMap, state: LayerState): Promise<void> {
  const [countries, states, cities] = await Promise.all([
    loadCountries(),
    loadStates(),
    loadCities(),
  ]);

  const countriesTagged: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: tagVisited(countries.features, state.visitedCountries, countryIso),
  };
  const statesTagged: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: tagVisited(states.features, state.visitedStates, stateIso),
  };
  const citiesTagged: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: tagVisited(cities.features, state.visitedCities, cityId),
  };

  if (!map.getSource("countries")) map.addSource("countries", { type: "geojson", data: countriesTagged });
  else (map.getSource("countries") as maplibregl.GeoJSONSource).setData(countriesTagged);

  if (!map.getSource("states")) map.addSource("states", { type: "geojson", data: statesTagged });
  else (map.getSource("states") as maplibregl.GeoJSONSource).setData(statesTagged);

  if (!map.getSource("cities")) map.addSource("cities", { type: "geojson", data: citiesTagged });
  else (map.getSource("cities") as maplibregl.GeoJSONSource).setData(citiesTagged);

  const visitedFillExpr = ["case", ["==", ["get", "visited"], 1], VISITED_FILL, NOT_VISITED_FILL] as unknown as maplibregl.PropertyValueSpecification<string>;
  const visitedOutlineExpr = ["case", ["==", ["get", "visited"], 1], VISITED_OUTLINE, NOT_VISITED_OUTLINE] as unknown as maplibregl.PropertyValueSpecification<string>;
  const visitedOpacityExpr = ["case", ["==", ["get", "visited"], 1], 0.55, 0.0] as unknown as maplibregl.PropertyValueSpecification<number>;

  if (!map.getLayer("countries-fill")) {
    map.addLayer({
      id: "countries-fill",
      type: "fill",
      source: "countries",
      paint: { "fill-color": visitedFillExpr, "fill-opacity": visitedOpacityExpr },
    });
    map.addLayer({
      id: "countries-line",
      type: "line",
      source: "countries",
      paint: { "line-color": visitedOutlineExpr, "line-width": 0.6, "line-opacity": 0.8 },
    });
  }

  if (!map.getLayer("states-fill")) {
    map.addLayer({
      id: "states-fill",
      type: "fill",
      source: "states",
      paint: { "fill-color": visitedFillExpr, "fill-opacity": visitedOpacityExpr },
    });
    map.addLayer({
      id: "states-line",
      type: "line",
      source: "states",
      paint: { "line-color": visitedOutlineExpr, "line-width": 0.4, "line-opacity": 0.6 },
    });
  }

  if (!map.getLayer("cities-circle")) {
    map.addLayer({
      id: "cities-circle",
      type: "circle",
      source: "cities",
      filter: ["==", ["get", "visited"], 1],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 6, 6, 10, 10],
        "circle-color": VISITED_FILL,
        "circle-stroke-color": VISITED_OUTLINE,
        "circle-stroke-width": 1,
        "circle-opacity": 0.85,
      },
    });
  }

  applyLayer(map, currentLayer);
}

const ALL_LAYER_IDS = [
  "countries-fill",
  "countries-line",
  "states-fill",
  "states-line",
  "cities-circle",
];

const VISIBLE_BY_LAYER: Record<LayerKind, string[]> = {
  countries: ["countries-fill", "countries-line"],
  states: ["countries-line", "states-fill", "states-line"],
  cities: ["countries-line", "cities-circle"],
};

export function applyLayer(map: MlMap, kind: LayerKind): void {
  currentLayer = kind;
  const visible = new Set(VISIBLE_BY_LAYER[kind]);
  for (const id of ALL_LAYER_IDS) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", visible.has(id) ? "visible" : "none");
  }
}
