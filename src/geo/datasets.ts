import type { FeatureCollection, Feature, Polygon, MultiPolygon, Point } from "geojson";

const COUNTRIES_URL = `${import.meta.env.BASE_URL}data/countries.geojson`;
const STATES_URL = `${import.meta.env.BASE_URL}data/states.geojson`;
const CITIES_URL = `${import.meta.env.BASE_URL}data/cities.geojson`;

let countries: FeatureCollection<Polygon | MultiPolygon> | null = null;
let states: FeatureCollection<Polygon | MultiPolygon> | null = null;
let cities: FeatureCollection<Point> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadCountries() {
  if (!countries) {
    countries = await fetchJson<FeatureCollection<Polygon | MultiPolygon>>(COUNTRIES_URL);
  }
  return countries;
}

export async function loadStates() {
  if (!states) {
    states = await fetchJson<FeatureCollection<Polygon | MultiPolygon>>(STATES_URL);
  }
  return states;
}

export async function loadCities() {
  if (!cities) {
    cities = await fetchJson<FeatureCollection<Point>>(CITIES_URL);
  }
  return cities;
}

export function countryIso(feature: Feature): string {
  const props = feature.properties ?? {};
  const iso = props.ISO_A3 as string | undefined;
  if (iso && iso !== "-99" && iso !== "") return iso;
  const adm0 = props.ADM0_A3 as string | undefined;
  if (adm0 && adm0 !== "-99" && adm0 !== "") return adm0;
  const sov = props.SOV_A3 as string | undefined;
  if (sov && sov !== "-99" && sov !== "") return sov;
  return (props.ADMIN as string) ?? "?";
}

export function stateIso(feature: Feature): string {
  const props = feature.properties ?? {};
  const iso = props.iso_3166_2 as string | undefined;
  if (iso && iso !== "-99" && iso !== "") return iso;
  const code = props.adm1_code as string | undefined;
  if (code) return code;
  const admin = (props.admin as string) ?? "?";
  const name = (props.name as string) ?? "?";
  return `${admin}|${name}`;
}

export function cityId(feature: Feature): string {
  const props = feature.properties ?? {};
  const a3 = (props.ADM0_A3 as string) ?? "?";
  const name = (props.NAMEASCII as string) ?? (props.NAME as string) ?? "?";
  const adm1 = (props.ADM1NAME as string) ?? "";
  return `${a3}|${adm1}|${name}`;
}
