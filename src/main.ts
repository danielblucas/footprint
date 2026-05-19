import "./ui/styles.css";
import { setupDropzone } from "./import/dropzone";
import { joinVisits } from "./geo/spatialJoin";
import { loadVisited, saveVisited, saveRawImport, mergeVisited } from "./store/visitedFile";
import { createMap, setMapTheme, type MapTheme } from "./map/map";
import { initLayers, applyLayer } from "./map/layers";
import { renderStats } from "./ui/sidebar";
import type { LayerKind, VisitedFile } from "./types";

const THEME_KEY = "footprint.theme";
function loadTheme(): MapTheme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "dark" ? "dark" : "light";
}
function saveTheme(theme: MapTheme) {
  localStorage.setItem(THEME_KEY, theme);
}
function applyThemeToDocument(theme: MapTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = theme === "dark" ? "Light" : "Dark";
}

let currentTheme = loadTheme();
applyThemeToDocument(currentTheme);

const dropzoneEl = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const statsEl = document.getElementById("stats") as HTMLElement;
const togglesEl = document.getElementById("layer-toggles") as HTMLElement;
const mapEl = document.getElementById("map") as HTMLElement;

const map = createMap(mapEl, currentTheme);
const themeToggleBtn = document.getElementById("theme-toggle") as HTMLButtonElement;
let mapReady = false;
const onMapReady = new Promise<void>((resolve) => {
  map.on("load", () => {
    mapReady = true;
    resolve();
  });
});

let current: VisitedFile = { countries: [], states: [], cities: [], updatedAt: 0 };

function statsFrom(file: VisitedFile) {
  return {
    countries: file.countries.length,
    states: file.states.length,
    cities: file.cities.length,
  };
}

async function renderFromCurrent() {
  if (!mapReady) await onMapReady;
  await initLayers(map, {
    visitedCountries: new Set(current.countries),
    visitedStates: new Set(current.states),
    visitedCities: new Set(current.cities),
  });
  if (current.countries.length || current.states.length || current.cities.length) {
    renderStats(statsEl, statsFrom(current));
    togglesEl.hidden = false;
  }
}

async function bootstrap() {
  current = await loadVisited();
  await renderFromCurrent();
}

// Google Timeline drag-and-drop
setupDropzone(dropzoneEl, fileInput, async (result, fileName) => {
  console.log(`Imported ${fileName}: ${result.visits.length} visits, ${result.points.length} points`);
  if (result.visits.length === 0 && result.points.length === 0) {
    alert(`Could not find any visits or location points in ${fileName}.\nMake sure this is a Google Timeline export.`);
    return;
  }
  const joined = await joinVisits(result.visits);
  const merged = mergeVisited(current, {
    countries: joined.visitedCountries,
    states: joined.visitedStates,
    cities: joined.visitedCities,
  });
  current = await saveVisited(merged);
  await saveRawImport(fileName, {
    source: fileName,
    importedAt: Date.now(),
    visits: result.visits,
    points: result.points,
  });
  await renderFromCurrent();
});

document.querySelectorAll<HTMLInputElement>('input[name="layer"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) applyLayer(map, input.value as LayerKind);
  });
});

themeToggleBtn.addEventListener("click", async () => {
  themeToggleBtn.disabled = true;
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  saveTheme(currentTheme);
  applyThemeToDocument(currentTheme);
  await setMapTheme(map, currentTheme);
  await renderFromCurrent();
  themeToggleBtn.disabled = false;
});

void bootstrap();
