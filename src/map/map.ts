import maplibregl, { Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapTheme = "light" | "dark";

const POSITRON_TILES = [
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
];

const DARK_MATTER_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];

function styleFor(theme: MapTheme): StyleSpecification {
  const tiles = theme === "dark" ? DARK_MATTER_TILES : POSITRON_TILES;
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  };
}

export function createMap(container: HTMLElement, theme: MapTheme): MlMap {
  const map = new maplibregl.Map({
    container,
    style: styleFor(theme),
    center: [0, 25],
    zoom: 1.4,
    minZoom: 1,
    maxZoom: 16,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}

export function setMapTheme(map: MlMap, theme: MapTheme): Promise<void> {
  return new Promise((resolve) => {
    const onStyleLoad = () => {
      map.off("style.load", onStyleLoad);
      resolve();
    };
    map.on("style.load", onStyleLoad);
    map.setStyle(styleFor(theme));
  });
}
