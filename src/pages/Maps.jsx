import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import {
  DEFAULT_PROJECTION_CODE,
  PROJECTION_GROUPS,
  PROJECTION_OPTIONS,
  registerProjectionDefs,
  mgaToWgs84,
  wgs84ToMga2020,
  projectCoords,
  projectLonLatTo,
  projectToLonLat,
  getProjectionLabel,
} from "../lib/projections.js";
import { supabase } from "../lib/supabaseClient.js";
import { useAppVisibilityContext } from "../context/AppVisibilityContext.jsx";

registerProjectionDefs();
/**
 * Safe Point constructor:
 * If google maps is already loaded, use google.maps.Point.
 * Otherwise, use a dummy Point-like constructor.
 */
const GPoint =
  (typeof window !== "undefined" &&
    window.google &&
    window.google.maps &&
    window.google.maps.Point) ||
  function DummyPoint(x, y) {
    this.x = x;
    this.y = y;
  };


function buildDirectionsUrl(lat, lng) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return "";
  }

  // Android: opens navigation directly in Google Maps app
  if (isAndroid) {
    return `google.navigation:q=${latNum},${lngNum}`;
  }

  // iPhone/iPad: opens Google Maps app if installed
  if (isIOS) {
    return `comgooglemaps://?daddr=${latNum},${lngNum}&directionsmode=driving`;
  }

  // Desktop / fallback
  return `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}`;
}
function buildSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}
function buildLatLngSearchUrl(lat, lng) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return "";
  }

  // Android: opens maps app at the coordinate
  if (isAndroid) {
    return `geo:${latNum},${lngNum}?q=${latNum},${lngNum}`;
  }

  // iPhone/iPad: opens Google Maps app if installed
  if (isIOS) {
    return `comgooglemaps://?q=${latNum},${lngNum}`;
  }

  // Desktop / fallback
  return `https://www.google.com/maps/search/?api=1&query=${latNum},${lngNum}`;
}

/**
 * Google Earth Web URL builder (historical imagery available there).
 * Note: Historical imagery slider is NOT available in Google Maps JS API.
 */
function buildGoogleEarthUrl(lat, lng, zoom = 18) {
  return `https://earth.google.com/web/@${lat},${lng},0a,${zoom}d,35y,0h,0t,0r`;
}

/**
 * ✅ SSM/BM Station Summary URL builder (LGATE-076)
 */
function buildStationSummaryUrlFromProps(props = {}) {
  const direct =
    props.url ||
    props.URL ||
    props.station_summary_link ||
    props.STATION_SUMMARY_LINK ||
    props.station_summary_url ||
    props.STATION_SUMMARY_URL;

  if (direct && /^https?:\/\//i.test(String(direct))) {
    return String(direct);
  }

  const pointNo =
    props.point_number ||
    props.POINT_NUMBER ||
    props.pointno ||
    props.PointNo ||
    props.database_number ||
    props.DATABASE_NUMBER ||
    "";

  const s = String(pointNo).trim();
  if (/^\d+$/.test(s)) {
    return `https://gola.es.landgate.wa.gov.au/Gola/gola.exe/getpointinfo?PointNo=${s}`;
  }

  return "";
}

function buildGolaFallbackSearch(props = {}, name = "") {
  const pointNo =
    props.point_number ||
    props.POINT_NUMBER ||
    props.database_number ||
    props.DATABASE_NUMBER ||
    "";

  const q = String(pointNo).trim() || String(name).trim() || "geodetic mark";
  return `https://www.google.com/search?q=${encodeURIComponent(
    `site:gola.es.landgate.wa.gov.au ${q}`
  )}`;
}

const TOP_BAR_HEIGHT = 56;

// ---- Landgate live ArcGIS endpoints ----
const LGATE_076_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/1/query"; // SSM + BM
const LGATE_199_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/62/query"; // RM
const LGATE_001_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/2/query"; // Cadastre (LGATE-001)
const LGATE_233_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Boundaries/MapServer/14/query"; // LGA Boundaries (LGATE-233)
const LGATE_234_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Boundaries/MapServer/16/query"; // Localities (LGATE-234)
  const DPLH_070_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/111/query"; // R-Codes Zoning (DPLH-070)
const WCORP_068_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/17/query"; // Sewer Gravity Pipe (WCORP-068)
const WCORP_026_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/1/query"; // Sewer Manhole (WCORP-026)

  // ---- Speed knobs ----
const MIN_GEODETIC_ZOOM = 12;
const MIN_CADASTRE_ZOOM = 13;
const SHOW_LABELS_ZOOM = 15;

const REFRESH_DEBOUNCE_MS = 600;
const MAX_FEATURES_PER_VIEW = 1800;
const MAX_CADASTRE_FEATURES_PER_VIEW = 4000;

const FETCH_THROTTLE_MS = 2500;
const CADASTRE_FETCH_THROTTLE_MS = 5000;
const STALE_REFRESH_MS = 30 * 60 * 1000;

// ---- WA Survey colours & symbols ----
const ssmTriangleSymbol = {
  path: "M 0 -2 L 2 2 L -2 2 Z",
  fillColor: "#A6B96A",
  fillOpacity: 0.95,
  strokeColor: "#ffffff",
  strokeWeight: 1,
  scale: 2.6,
  labelOrigin: new GPoint(0, 5),
};

const bmSquareSymbol = {
  path: "M -2 -2 L 2 -2 L 2 2 L -2 2 Z",
  fillColor: "#1976d2",
  fillOpacity: 0.95,
  strokeColor: "#ffffff",
  strokeWeight: 1,
  scale: 2.4,
  labelOrigin: new GPoint(0, 5),
};

const rmCrossSymbol = {
  path: "M -2 -2 L 2 2 M 2 -2 L -2 2",
  strokeColor: "#111111",
  strokeOpacity: 1,
  strokeWeight: 2,
  scale: 2.4,
  labelOrigin: new GPoint(0, 5),
};

// ---- helpers ----
async function fetchArcgisGeojsonInView(url, bounds, where = "1=1") {
  if (!bounds) return { type: "FeatureCollection", features: [] };

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const geometry = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;

  const params = new URLSearchParams({
    where,
    outFields: "*",
    f: "geojson",
    outSR: "4326",
    geometry,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    returnGeometry: "true",
    t: Date.now().toString(),
  });

  const res = await fetch(`${url}?${params.toString()}`);
  const json = await res.json();

  if (json?.error) throw new Error(json.error.message || "ArcGIS query error");

  return { type: "FeatureCollection", features: json?.features || [] };
}

function isDestroyed(props = {}) {
  const flagKeys = [
    "is_destroyed",
    "destroyed",
    "destroyed_flag",
    "destroyed_ind",
    "physical_status_destroyed",
  ];

  for (const k of flagKeys) {
    const v = props?.[k];
    if (
      v === true ||
      v === 1 ||
      String(v).toUpperCase() === "Y" ||
      String(v).toUpperCase() === "YES"
    ) {
      return true;
    }
  }

  const allVals = Object.values(props)
    .flatMap((v) => {
      if (v === null || v === undefined) return [];
      if (typeof v === "object") return [];
      return [String(v)];
    })
    .join(" | ")
    .toUpperCase();

  return (
    allVals.includes("DESTROY") ||
    allVals.includes("DESTROYED") ||
    allVals.includes("OBLITERAT") ||
    allVals.includes("REMOV") ||
    allVals.includes("CANCEL") ||
    allVals.includes("DISCONTINU") ||
    allVals.includes("NOT FOUND") ||
    allVals.includes("MISSING") ||
    allVals.includes("INVALID") ||
    allVals.includes("RETIRED") ||
    allVals.includes("SUPERSEDED") ||
    allVals.trim() === "D"
  );
}

function split076Features(features) {
  const ssm = [];
  const bm = [];

  features.forEach((f) => {
    const p = f?.properties || {};
    const rv = String(p.render_value || "").toUpperCase();
    const pt = String(p.point_type || "").toUpperCase();
    const cls = String(p.class || "").toUpperCase();

    const isBM =
      rv.startsWith("B") ||
      pt.includes("BM") ||
      pt.includes("BENCH") ||
      cls.includes("BM") ||
      cls.includes("BENCH");

    const isSSM =
      rv.startsWith("S") ||
      pt.includes("SSM") ||
      cls.includes("SSM") ||
      cls.includes("STANDARD SURVEY");

    if (isBM) bm.push(f);
    else if (isSSM) ssm.push(f);
    else ssm.push(f);
  });

  return { ssm, bm };
}

function pretty(v, digits = 4) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v.toFixed(digits);
  return String(v);
}

function firstProp(props, keys) {
  for (const k of keys) {
    const v = props?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

function buildPopupRowsForExample(props = {}, nameOverride) {
  const pointName =
    nameOverride ||
    props.geodetic_point_name ||
    props.reference_mark_name ||
    props.geodetic_point_pid ||
    "";

  const vertDatum = firstProp(props, ["vert_datum", "vertical_datum"]);
  const rl = firstProp(props, ["reduced_level", "reducedlevel", "height"]);

  const mgaZone = firstProp(props, ["mga2020_zone", "zone"]);
  const mgaE = firstProp(props, ["mga2020_easting", "easting"]);
  const mgaN = firstProp(props, ["mga2020_northing", "northing"]);

   const pcgE = firstProp(props, ["pcg2020_easting"]);
  const pcgN = firstProp(props, ["pcg2020_northing"]);

  const rows = [
    ["GEODETIC POINT NAME", pretty(pointName, 0)],
    ["VERT DATUM", pretty(vertDatum, 0)],
    ["REDUCED LEVEL (m)", pretty(rl, 4)],
    ["PCG2020 EASTING (m)", pretty(pcgE, 3)],
    ["PCG2020 NORTHING (m)", pretty(pcgN, 3)],
    ["MGA2020 ZONE", pretty(mgaZone, 0)],
    ["MGA2020 EASTING (m)", pretty(mgaE, 3)],
    ["MGA2020 NORTHING (m)", pretty(mgaN, 3)],
  ];

  return rows.filter(([, v]) => v !== "");
}

function buildPopupHtmlExample({ layerTag, name, props }) {
  const rows = buildPopupRowsForExample(props, name);
  const isSummaryLayer = layerTag === "SSM" || layerTag === "BM";
  const directSummaryUrl = isSummaryLayer
    ? buildStationSummaryUrlFromProps(props)
    : "";
  const summaryUrl =
    directSummaryUrl ||
    (isSummaryLayer ? buildGolaFallbackSearch(props, name) : "");

  return `
    <div style="font-family: Inter, sans-serif; font-size: 13px; min-width: 240px;">
      <div data-pw-drag-handle="1" style="font-weight:800; font-size:14px; margin-bottom:8px; color:#111;">
        ${layerTag} – ${name || ""}
      </div>

      ${rows
        .map(
          ([label, value]) => `
        <div style="padding:2px 0;">
          <div style="font-weight:700; color:#333;">${label}</div>
          <div style="color:#111;">${value}</div>
        </div>`
        )
        .join("")}

      <div style="display:flex; gap:8px; margin-top:10px;">
        <a href="${buildLatLngSearchUrl(
          props.lat ?? props.latitude ?? "",
          props.lng ?? props.longitude ?? ""
        )}" target="_blank" rel="noreferrer"
           style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                  border:1px solid #ccc; color:#111; background:#fff; font-weight:700; font-size:12px;">
          🔍 Open in Google Maps
        </a>
        <a href="${buildDirectionsUrl(
          props.lat ?? props.latitude ?? "",
          props.lng ?? props.longitude ?? ""
        )}" rel="noreferrer"
           style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                  border:1px solid #111; color:#fff; background:#111; font-weight:700; font-size:12px;">
          🚗 Directions
        </a>
      </div>

      ${
        isSummaryLayer
          ? `
      <div style="margin-top:8px; font-size:12px;">
        <a href="${summaryUrl}" target="_blank" rel="noreferrer"
           style="color:#1976d2; font-weight:700; text-decoration:none;">
          📄 Full Station Summary
        </a>
        <div style="color:#666; margin-top:2px;">
          Opens Landgate station summary (direct if available, otherwise search).
        </div>
      </div>`
          : ""
      }
    </div>
  `;
}

/* --------- Measurement fallbacks (if geometry lib missing) ---------- */
function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function approxPathLengthMeters(latLngPath) {
  let m = 0;
  for (let i = 1; i < latLngPath.length; i++) {
    m += haversineMeters(latLngPath[i - 1], latLngPath[i]);
  }
  return m;
}

function approxPolygonAreaM2(latLngPath) {
  if (latLngPath.length < 3) return 0;
  const lat0 =
    latLngPath.reduce((s, p) => s + p.lat, 0) / latLngPath.length;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  const R = 6371000;

  const pts = latLngPath.map((p) => ({
    x: (p.lng * Math.PI) / 180 * R * cosLat0,
    y: (p.lat * Math.PI) / 180 * R,
  }));

  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area2) / 2;
}


function fmtMGA(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "";
  return v.toFixed(3); // mm precision; change to 0 if you want whole metres
}

function isSmallScreen() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(max-width: 640px)")?.matches ||
    window.innerWidth <= 640
  );
}


/* ================================
   ✅ Draggable InfoWindows (field-friendly)
   - Applies to the most recently opened InfoWindow.
   - Drag handle: the top row of the popup content.
   ================================ */
function makeLatestInfoWindowDraggable() {
  try {
    const nodes = Array.from(document.querySelectorAll('.gm-style-iw-c, .gm-style-iw'));
    if (!nodes.length) return;

    const iwc = nodes[nodes.length - 1];
    if (!iwc || iwc.dataset.pwDraggable === "1") return;
    iwc.dataset.pwDraggable = "1";

    const handle =
      iwc.querySelector('[data-pw-drag-handle="1"]') ||
      iwc.querySelector("div") ||
      iwc;

    handle.style.cursor = "grab";
    handle.style.userSelect = "none";
    handle.style.touchAction = "none";

    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    let dragging = false;

    const readBase = () => {
      const tx = Number(iwc.dataset.pwTx || "0");
      const ty = Number(iwc.dataset.pwTy || "0");
      baseX = Number.isFinite(tx) ? tx : 0;
      baseY = Number.isFinite(ty) ? ty : 0;
    };

    const onDown = (ev) => {
      const e = ev;
      dragging = true;
      handle.style.cursor = "grabbing";
      startX = e.clientX;
      startY = e.clientY;
      readBase();
      ev.preventDefault?.();
      ev.stopPropagation?.();
    };

    const onMove = (ev) => {
      if (!dragging) return;
      const e = ev;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nx = baseX + dx;
      const ny = baseY + dy;
      iwc.style.transform = `translate(${nx}px, ${ny}px)`;
      iwc.dataset.pwTx = String(nx);
      iwc.dataset.pwTy = String(ny);
      ev.preventDefault?.();
      ev.stopPropagation?.();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = "grab";
    };

    handle.addEventListener("pointerdown", onDown, { passive: false });
window.addEventListener("pointermove", onMove, { passive: false });
window.addEventListener("pointerup", onUp, { passive: true });
window.addEventListener("pointercancel", onUp, { passive: true });
  } catch {
    // ignore
  }
}

/* ================================
   ✅ Persisted state helpers
   ================================ */
const MAPS_STATE_KEY = "pw_maps_state_v2"; // bump key to avoid slow-state migration issues

function safeReadState() {
  try {
    const raw = localStorage.getItem(MAPS_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteState(partial) {
  try {
    const prev = safeReadState() || {};
    const next = { ...prev, ...partial, updatedAt: Date.now() };
    localStorage.setItem(MAPS_STATE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function getCentroidFromGoogleGeometry(geometry, googleMaps) {
  const b = new googleMaps.LatLngBounds();

  const walk = (g) => {
    if (!g) return;
    const type = g.getType();

    if (type === "Point") {
      b.extend(g.get());
    } else if (type === "MultiPoint" || type === "LineString") {
      g.getArray().forEach((latLng) => b.extend(latLng));
    } else if (type === "MultiLineString" || type === "Polygon") {
      g.getArray().forEach((part) => walk(part));
    } else if (type === "MultiPolygon") {
      g.getArray().forEach((poly) => walk(poly));
    } else if (type === "LinearRing") {
      g.getArray().forEach((latLng) => b.extend(latLng));
    }
  };

  walk(geometry);

  if (b.isEmpty()) return null;
  return b.getCenter();
}

function buildInvisibleLabelMarker({ googleMaps, map, position, text, color, fontSize = "10px", fontWeight = "700" }) {
  return new googleMaps.Marker({
    position,
    map,
    clickable: false,
    zIndex: 1,
    icon: {
      path: "M 0 0",
      strokeOpacity: 0,
      fillOpacity: 0,
      scale: 0,
    },
    label: {
      text: String(text || ""),
      color,
      fontWeight,
      fontSize,
    },
  });
}

function getPolygonLabelText(feature, fields = []) {
  for (const key of fields) {
    const v = feature.getProperty(key);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function getFirstDefinedValue(obj = {}, keys = []) {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
  }
  return "";
}

function getFeaturePointName(props = {}, fields = [], fallback = "") {
  const v = getFirstDefinedValue(props, fields);
  if (v !== undefined && v !== null && String(v).trim() !== "") {
    return String(v).trim();
  }
  return fallback ? String(fallback).trim() : "";
}

function getFeaturePointId(props = {}, layer, fallback = "") {
  const idFields = layer?.data?.idFields || [];

  const picked = idFields
    .map((key) => props?.[key])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .map((v) => String(v).trim());

  if (picked.length) return picked.join("_");

  return (
    props.objectid ||
    props.OBJECTID ||
    props.fid ||
    props.id ||
    props.geodetic_point_pid ||
    props.reference_mark_pid ||
    props.point_number ||
    props.rm_point_number ||
    fallback
  );
}

function getFeatureZValue(props = {}, layer) {
  const zFields = layer?.data?.zFields || [];
  const v = getFirstDefinedValue(props, zFields);
  return v !== undefined && v !== null && String(v).trim() !== "" ? v : "";
}

function getPolygonPathsFromDataGeometry(geometry) {
  const polygons = [];

  const walk = (g) => {
    if (!g) return;

    const type = g.getType();

    if (type === "Polygon") {
      const rings = g.getArray().map((ring) => ring.getArray());
      if (rings.length) polygons.push(rings);
    } else if (type === "MultiPolygon") {
      g.getArray().forEach((poly) => walk(poly));
    }
  };

  walk(geometry);
  return polygons;
}

function dataPolygonFeatureContainsLatLng(feature, latLng, googleMaps) {
  if (!feature || !latLng || !googleMaps?.geometry?.poly) return false;

  const geometry = feature.getGeometry?.();
  const polygons = getPolygonPathsFromDataGeometry(geometry);

  for (const rings of polygons) {
    const outerRing = rings[0];
    if (!outerRing || outerRing.length < 3) continue;

    const outerPoly = new googleMaps.Polygon({ paths: outerRing });

    if (!googleMaps.geometry.poly.containsLocation(latLng, outerPoly)) {
      continue;
    }

    let insideHole = false;

    for (let i = 1; i < rings.length; i++) {
      const holeRing = rings[i];
      if (!holeRing || holeRing.length < 3) continue;

      const holePoly = new googleMaps.Polygon({ paths: holeRing });

      if (googleMaps.geometry.poly.containsLocation(latLng, holePoly)) {
        insideHole = true;
        break;
      }
    }

    if (!insideHole) return true;
  }

  return false;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getFeatureLabelText(props = {}, layer) {
  const labelFields = layer?.data?.dxfLabelFields || [];
  const v = getFirstDefinedValue(props, labelFields);
  return v !== undefined && v !== null && String(v).trim() !== ""
    ? String(v).trim()
    : "";
}

function Maps() {
  const location = useLocation();
  const navigate = useNavigate();
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

  const markersRef = useRef([]);
  const userLocationMarkerRef = useRef(null);
  const addressMarkerRef = useRef(null);
  const locationWatchIdRef = useRef(null);

  const addressInputRef = useRef(null);
  const addressAutocompleteRef = useRef(null);
  const jobNumberInputRef = useRef(null);

  const infoWindowRef = useRef(null);
  const hoverInfoWindowRef = useRef(null);
  const addressInfoWindowRef = useRef(null);

  const isAppVisible = useAppVisibilityContext();

  /* ================================
     ✅ Missing refs/state restored (full sweep)
     ================================ */

  // UI + view tick
  const [layers, setLayers] = useState([]);
  const layersRef = useRef([]);
  const [geodeticNotice, setGeodeticNotice] = useState("");
  const [viewTick, setViewTick] = useState(0);

  const toolsControlDivRef = useRef(null);
  const idleDebounceRef = useRef(null);
  const viewRef = useRef({ bounds: null, zoom: null });

useEffect(() => {
  layersRef.current = layers;
}, [layers]);

  // Fetch throttles + caches
const lastFetchRef = useRef({
  ssm076: 0,
  bm076: 0,
  rm199: 0,
  cad001: 0,
  lga233: 0,
  localities234: 0,
  zoning070: 0,
  sewer068: 0,
  sewer026: 0,
});

  const clustererRef = useRef(null);

   // Polygon layers (cadastre, LGA, zoning, future planning layers)
  const polygonLayersRef = useRef(new Map());

  // Point layers (SSM, BM, RM, future point layers)
const pointLayersRef = useRef(new Map());

// Line layers (future road centreline / contours / etc.)
const lineLayersRef = useRef(new Map());

  // Portal jobs markers/cluster
  const portalClustererRef = useRef(null);
  const portalMarkersByIdRef = useRef(new Map());
  const portalJobsByIdRef = useRef(new Map());
  const portalPointsByIdRef = useRef(new Map());
  const portalVisibleIdsRef = useRef(new Set());

  // Notes markers + info windows
  const noteMarkersByIdRef = useRef(new Map());
  const noteInfoWindowRef = useRef(null);
  const noteComposerIWRef = useRef(null);
  const noteClickListenerRef = useRef(null);

  // Measurement
  const measureModeRef = useRef(null);
  const [measureMode, setMeasureMode] = useState(null);
  const [hasMeasure, setHasMeasure] = useState(false);

  const infoModeRef = useRef(false);
const [infoMode, setInfoMode] = useState(false);

  const measureListenersRef = useRef([]);
  const measurePathRef = useRef([]);
  const measureLineRef = useRef(null);
  const measurePolyRef = useRef(null);
  const measureLiveIWRef = useRef(null);
  const measureFinalIWRef = useRef(null);
  const lastMeasureSummaryRef = useRef(null);
  const lastMeasureLatLngRef = useRef(null);
  const lastMeasureSavedRef = useRef(false);
  const measureOverlaysByNoteIdRef = useRef(new Map());
  const mainInfoOpenRef = useRef(false);
  const activeMainInfoKeyRef = useRef(null);   // `${layerId}::${markerId}`
  const activeMainInfoLayerRef = useRef(null);

    // Export
  const exportModeRef = useRef(null); // "rectangle" | "polygon" | null
  const [exportMode, setExportMode] = useState(null);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportHasFence, setExportHasFence] = useState(false);
  const [exportFormat, setExportFormat] = useState("dxf");
  const [exportProjection, setExportProjection] = useState(DEFAULT_PROJECTION_CODE);
  const [exportWarning, setExportWarning] = useState("");
  const [exportSummary, setExportSummary] = useState(null);
  const [exportCountSummary, setExportCountSummary] = useState(null);
  const [exportLargeConfirmArmed, setExportLargeConfirmArmed] = useState(false);

  const exportListenersRef = useRef([]);
  const exportFenceRef = useRef(null);      // rectangle or polygon overlay
  const exportPathRef = useRef([]);         // polygon path points
  const exportGeometryRef = useRef(null);   // cached geometry for ArcGIS query

  // ✅ Map Notes (synced via Supabase, cached locally for fast startup/offline)
  const MAP_NOTES_CACHE_KEY = "pw_maps_notes_cache_v1";

  const [mapNotes, setMapNotes] = useState(() => {
    // Start fast with local cache, then replace with Supabase results
    try {
      const raw = localStorage.getItem(MAP_NOTES_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
const mapNotesRef = useRef(mapNotes);
useEffect(() => {
  mapNotesRef.current = mapNotes;
}, [mapNotes]);

  const [noteAddMode, setNoteAddMode] = useState(false);
  const [notesSyncError, setNotesSyncError] = useState("");

  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(() => {
    const s = safeReadState() || {};
    return typeof s.showAllNotes === "boolean" ? s.showAllNotes : false;
  });

  // Resolve "who am I?" once (for note attribution)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!alive || !user) return;

        // Try pull a friendly name from profiles (falls back to email/id)
        let name = "";
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("display_name, full_name, first_name, last_name, email")
            .eq("id", user.id)
            .limit(1)
            .single();
          name =
            prof?.display_name ||
            prof?.full_name ||
            [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") ||
            prof?.email ||
            "";
        } catch {
          // ignore (profiles might not exist / RLS might block)
        }

        if (!name) name = user.email || user.id;

        // Store auth user id
        if (alive) setCurrentUserId(user.id);

        // Determine admin role (best-effort; UI only — RLS still enforces)
        try {
          const { data: roleRow } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .limit(1)
            .single();
          if (alive) setCurrentUserIsAdmin(String(roleRow?.role || "").toLowerCase() === "admin");
        } catch {
          // ignore
        }

        if (alive) setCurrentUserName(name);
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, []);
  /* ================================
     ✅ Core UI state (restored)
     ================================ */

  const restoredState = useMemo(() => safeReadState() || {}, []);

  const [activeTab, setActiveTab] = useState(() => restoredState.activeTab || "layers");
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof restoredState.panelOpen === "boolean" ? restoredState.panelOpen : true
  );

  // Mobile-only: retractable right panel as a bottom drawer (does not affect desktop)
  const [isMobile, setIsMobile] = useState(() => {
    try {
      return typeof window !== "undefined" && window.innerWidth <= 900;
    } catch {
      return false;
    }
  });
 const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(true);
const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);
const [isFollowingLocation, setIsFollowingLocation] = useState(false);

const mapsDrawerOpen = !mobilePanelCollapsed;

const openMapsDrawer = () => setMobilePanelCollapsed(false);
const closeMapsDrawer = () => setMobilePanelCollapsed(true);
const toggleMapsDrawer = () => setMobilePanelCollapsed((prev) => !prev);

  useEffect(() => {
    const onResize = () => {
      try {
        const mobile = typeof window !== "undefined" && window.innerWidth <= 900;
        setIsMobile(mobile);
        // Keep drawer behaviour the same on desktop and mobile.
      } catch {
        // ignore
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    // Default to collapsed on mobile so the map is usable immediately in the field
    try {
      if (isMobile) setMobilePanelCollapsed(true);
    } catch {
      // ignore
    }
  }, [isMobile]);


  // Jobs search (portal jobs)
  const [jobNumberQuery, setJobNumberQuery] = useState(() => restoredState.jobNumberQuery || "");
  const [jobPicked, setJobPicked] = useState(() => !!restoredState.jobPicked);
  const [jobNumberActiveIndex, setJobNumberActiveIndex] = useState(-1);

  // Portal jobs panel
  const [showAllPortalJobs, setShowAllPortalJobs] = useState(() => !!restoredState.showAllPortalJobs);
  const [portalSelectedJobId, setPortalSelectedJobId] = useState(
    () => restoredState.portalSelectedJobId || null
  );
  const portalSelectedJobIdRef = useRef(null);
  const selectedPortalJobNumberRef = useRef("");

  // Portal jobs fetch state
  const [portalJobs, setPortalJobs] = useState([]);
  const [portalJobsLoading, setPortalJobsLoading] = useState(false);
  const [portalJobsError, setPortalJobsError] = useState("");

  // Address card
  const [selectedAddress, setSelectedAddress] = useState(null);

  const fetchNotesFromSupabase = async () => {
    try {
      setNotesSyncError("");
      const { data, error } = await supabase
        .from("map_notes")
        .select("id, text, lat, lng, created_at, created_by, created_by_name, job_id, job_number, measure_mode, measure_path")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      setMapNotes(data || []);
            try {
        localStorage.setItem(MAP_NOTES_CACHE_KEY, JSON.stringify(data || []));
      } catch {}
    } catch (e) {
      console.error("Fetch notes failed:", e);
      setNotesSyncError("Notes are showing from device cache (not synced).");
    }
  };

  // Load + realtime sync for cross-device notes
useEffect(() => {
  if (!isAppVisible) return;

  let mounted = true;

  (async () => {
    if (!mounted) return;
    await fetchNotesFromSupabase();
  })();

  const channel = supabase
    .channel("pw-map-notes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "map_notes" },
      () => {
        fetchNotesFromSupabase();
      }
    )
    .subscribe();

  return () => {
    mounted = false;
    try {
      supabase.removeChannel(channel);
    } catch {}
  };
}, [isAppVisible]);

// Persist UI state
  useEffect(() => {
    safeWriteState({
      jobNumberQuery,
      jobPicked,
      activeTab,
      panelOpen,
      showAllPortalJobs,
      portalSelectedJobId,
      showAllNotes,
    });
  }, [jobNumberQuery, jobPicked, activeTab, panelOpen, showAllPortalJobs, portalSelectedJobId, showAllNotes]);


  // Notes filter default:
  // - If no job is selected, we must show all notes.
  // - When a job becomes selected from none, default to showing that job’s notes.
  const prevSelectedJobRef = useRef(null);
  useEffect(() => {
    const prev = prevSelectedJobRef.current;
    prevSelectedJobRef.current = portalSelectedJobId || null;

    if (!portalSelectedJobId) {
      setShowAllNotes(true);
      return;
    }

    if (!prev) {
      // first job selection
      setShowAllNotes(false);
    }
  }, [portalSelectedJobId]);

    const visibleExportableLayers = useMemo(
    () =>
      (layers || []).filter(
        (l) => l.visible && l.data?.exportable
      ),
    [layers]
  );

  const exportProjectionPreview = useMemo(() => {
    return (
      PROJECTION_OPTIONS.find((opt) => opt.code === exportProjection)?.label ||
      getProjectionLabel(exportProjection)
    );
  }, [exportProjection]);

  const exportFilenamePreview = useMemo(() => {
    const ext = exportFormat === "csv" ? "csv" : "dxf";
    return `PWS_Maps_Export_${exportProjection}_${ext}_YYYY-MM-DD_HH-mm-ss.${ext}`;
  }, [exportProjection, exportFormat]);

  /* ================================
     ✅ Map Notes (pins)
     ================================ */

  const formatNoteTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      });
    } catch {
      return "";
    }
  };

  const syncNoteMarkers = (notes) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    const wanted = new Set((notes || []).map((n) => n.id));

    // Add / update
    (notes || []).forEach((n) => {
      const existing = noteMarkersByIdRef.current.get(n.id);
      const pos = { lat: n.lat, lng: n.lng };

      if (existing) {
        existing.setPosition(pos);
        existing.setTitle(n.text || "Note");
        return;
      }

      const marker = new window.google.maps.Marker({
        position: pos,
        map,
        clickable: true,
        title: n.text || "Note",
        zIndex: 1000,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#FFD54F",
          fillOpacity: 1,
          strokeColor: "#111",
          strokeOpacity: 1,
          strokeWeight: 2,
          scale: 7,
        },
        label: {
          text: "N",
          color: "#111",
          fontWeight: "900",
          fontSize: "12px",
        },
      });

      marker.addListener("click", () => {
        openNoteInfo(n.id);
      });

      noteMarkersByIdRef.current.set(n.id, marker);
    });

    // Remove missing
    for (const [id, marker] of noteMarkersByIdRef.current.entries()) {
      if (!wanted.has(id)) {
        try {
          marker.setMap(null);
        } catch {
          // ignore
        }
        noteMarkersByIdRef.current.delete(id);
      }
    }
  };

  const deleteNoteById = async (id) => {
    // Optimistic UI (feels instant)
    const prevNotes = mapNotes || [];
    setMapNotes((prev) => (prev || []).filter((n) => n.id !== id));

    const marker = noteMarkersByIdRef.current.get(id);
    if (marker) {
      try {
        marker.setMap(null);
      } catch {
        // ignore
      }
      noteMarkersByIdRef.current.delete(id);
    }

    try {
      noteInfoWindowRef.current?.close();
      noteComposerIWRef.current?.close();
    } catch {
      // ignore
    }

    try {
      const { error } = await supabase.from("map_notes").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      console.error("Delete note failed:", e);
      // Roll back locally if delete fails
      setMapNotes(prevNotes);
      alert("Couldn’t delete note. Check your connection and try again.");
    }
  };

  const openNoteInfo = (id, opts = {}) => {
    const map = mapRef.current;
    if (!map) return;

        const note = (mapNotesRef.current || []).find((n) => n.id === id);
    if (!note) return;


    // Show measurement overlay (if this note has one) and hide others
    try {
      for (const [, ov] of measureOverlaysByNoteIdRef.current.entries()) {
        try {
          ov.setMap(null);
        } catch {}
      }

      // Build overlay on demand from persisted geometry
      let ov = measureOverlaysByNoteIdRef.current.get(id);
      if (!ov && note.measure_path && Array.isArray(note.measure_path) && note.measure_path.length >= 2) {
        const pts = note.measure_path
          .map((p) => {
            const lat = Number(p?.lat);
            const lng = Number(p?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return new window.google.maps.LatLng(lat, lng);
          })
          .filter(Boolean);

        if (pts.length >= 2) {
          const mode = note.measure_mode || "distance";
          if (mode === "area") {
            ov = new window.google.maps.Polygon({
              map: null,
              paths: pts,
              strokeColor: "#d32f2f",
              strokeOpacity: 1,
              strokeWeight: 2,
              fillColor: "#d32f2f",
              fillOpacity: 0.12,
              clickable: false,
            });
          } else {
            ov = new window.google.maps.Polyline({
              map: null,
              path: pts,
              strokeColor: "#d32f2f",
              strokeOpacity: 1,
              strokeWeight: 2,
              clickable: false,
            });
          }
          measureOverlaysByNoteIdRef.current.set(id, ov);
        }
      }

      if (ov) {
        try {
          ov.setMap(map);
        } catch {}
      }
    } catch {
      // ignore
    }

    const canManageNote =
      !!currentUserIsAdmin ||
      (currentUserId && String(note.created_by || "") === String(currentUserId)) ||
      (!note.created_by &&
        currentUserName &&
        String(note.created_by_name || "").toLowerCase() ===
          String(currentUserName).toLowerCase());

    const attachedJobLabel = note.job_number ? `Job #${note.job_number}` : "";

    const marker = noteMarkersByIdRef.current.get(id);
    const safeText = String(note.text || "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safeTime = formatNoteTime(note.created_at);
    const safeBy = String(note.created_by_name || "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
const mga = wgs84ToMga2020(note.lat, note.lng);
const mgaLine = mga
  ? `MGA2020 (Zone ${mga.zone}) — E ${fmtMGA(mga.easting)}  N ${fmtMGA(mga.northing)}`
  : "";
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; font-size: 12px; min-width: 220px;">
        <div data-pw-drag-handle="1" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <div style="font-weight:950; font-size:13px; color:#111;">📝 Note</div>
          ${canManageNote ? `<button id="note-edit-${id}"
            style="border:2px solid #111; background:#111; color:#fff; font-weight:900; border-radius:8px;
                   padding:4px 8px; cursor:pointer; font-size:12px;">
            Edit
          </button>
          <button id="note-del-${id}"
            style="border:2px solid #111; background:#fff; color:#111; font-weight:900; border-radius:8px;
                   padding:4px 8px; cursor:pointer; font-size:12px;">
            Delete
          </button>` : ""}
        </div>


        <div id="note-view-${id}" style="margin-top:8px; white-space:pre-wrap; color:#111;">${
          safeText || "—"
        }</div>
        <textarea id="note-editarea-${id}" rows="4"
          style="display:none; width:100%; margin-top:8px; padding:8px; border-radius:10px; border:2px solid #111; font-size:12px; box-sizing:border-box; resize:vertical;">${
            safeText || ""
          }</textarea>
                  <div style="display:flex; gap:8px; margin-top:10px;">
          <a href="${buildLatLngSearchUrl(note.lat, note.lng)}"
             target="_blank" rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:10px;
                    border:2px solid #111; color:#111; background:#fff; font-weight:900; font-size:12px;">
            📍 Go To
          </a>
          <a href="${buildDirectionsUrl(note.lat, note.lng)}"
             rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:10px;
                    border:2px solid #111; color:#fff; background:#111; font-weight:900; font-size:12px;">
            🚗 Directions
          </a>
        </div>
        <div id="note-edit-actions-${id}" style="display:none; gap:8px; margin-top:8px;">
          <button id="note-cancel-${id}"
            style="flex:1; padding:6px 8px; border-radius:10px; border:2px solid #111; background:#fff; color:#111; font-weight:900; cursor:pointer; font-size:12px;">Cancel</button>
          <button id="note-save-${id}"
            style="flex:1; padding:6px 8px; border-radius:10px; border:2px solid #111; background:#111; color:#fff; font-weight:900; cursor:pointer; font-size:12px;">Save</button>
        </div>
        <div style="margin-top:8px; font-size:11px; color:#444; font-weight:800;">${
          safeTime || ""
        }</div>
      ${attachedJobLabel ? `<div style="margin-top:4px; font-size:11px; color:#444; font-weight:800;">Attached: ${attachedJobLabel}</div>` : ""}
${mgaLine ? `<div style="margin-top:4px; font-size:11px; color:#444; font-weight:800;">${mgaLine}</div>` : ""}
${safeBy ? `<div style="margin-top:4px; font-size:11px; color:#444; font-weight:800;">By: ${safeBy}</div>` : ""}
</div>
    `;

    noteInfoWindowRef.current.setContent(html);

    if (marker) {
      noteInfoWindowRef.current.open({ anchor: marker, map });
    } else {
      noteInfoWindowRef.current.setPosition({ lat: note.lat, lng: note.lng });
      noteInfoWindowRef.current.open({ map });
    }

    if (opts.zoom) {
      const z = map.getZoom() || 16;
      map.panTo({ lat: note.lat, lng: note.lng });
      map.setZoom(Math.max(z, 18));
    }

    window.google.maps.event.addListenerOnce(noteInfoWindowRef.current, "domready", () => {
      setTimeout(makeLatestInfoWindowDraggable, 0);
      const delBtn = document.getElementById(`note-del-${id}`);
      if (delBtn) delBtn.onclick = () => deleteNoteById(id);

      const editBtn = document.getElementById(`note-edit-${id}`);
      const viewDiv = document.getElementById(`note-view-${id}`);
      const ta = document.getElementById(`note-editarea-${id}`);
      const actions = document.getElementById(`note-edit-actions-${id}`);
      const cancelBtn = document.getElementById(`note-cancel-${id}`);
      const saveBtn = document.getElementById(`note-save-${id}`);

      const showEdit = () => {
        if (viewDiv) viewDiv.style.display = "none";
        if (ta) ta.style.display = "block";
        if (actions) actions.style.display = "flex";
        if (ta) ta.focus();
      };

      const hideEdit = () => {
        if (viewDiv) viewDiv.style.display = "block";
        if (ta) ta.style.display = "none";
        if (actions) actions.style.display = "none";
      };

      if (editBtn) editBtn.onclick = () => showEdit();
      if (cancelBtn) cancelBtn.onclick = () => hideEdit();

      if (saveBtn) {
  saveBtn.onclick = async () => {
    const newText = String(ta?.value || "").trim();
    if (!newText) {
      if (ta) ta.style.borderColor = "#d32f2f";
      return;
    }

    // Disable immediately
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
    } catch {}

    // Optimistic UI update (instant)
    const prevNotes = mapNotes || [];
    setMapNotes((prev) =>
      (prev || []).map((n) => (n.id === id ? { ...n, text: newText } : n))
    );

    // Update the open popup instantly too (so it "refreshes straight away")
    try {
      if (viewDiv) viewDiv.textContent = newText;
    } catch {}

        // ✅ Update pin tooltip/title immediately (so marker reflects edited text)
    try {
      const m = noteMarkersByIdRef.current.get(id);
      if (m) {
        m.setTitle(newText || "Note");
      }
    } catch {}

    try {
      // Always read auth user (fixes notes created before currentUserId loaded)
      let authUserId = currentUserId || null;
      let authUserName = currentUserName || null;

      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) authUserId = data.user.id;
        if (!authUserName) authUserName = data?.user?.email || data?.user?.id || null;
      } catch {}

      // If note was created with created_by null, claim it now (prevents RLS update failures)
      const payload = { text: newText };
      if (!note.created_by && authUserId) {
        payload.created_by = authUserId;
        if (!note.created_by_name && authUserName) payload.created_by_name = authUserName;
      }

  const { data: updated, error } = await supabase
  .from("map_notes")
  .update(payload)
  .eq("id", id)
  .select(
    "id, text, lat, lng, created_at, created_by, created_by_name, job_id, job_number, measure_mode, measure_path"
  )
  .maybeSingle(); // ✅ avoids PGRST116 when 0 rows are returned

if (error) throw error;

// ✅ If RLS blocks the returned row, updated will be null.
// In that case, just refresh notes from Supabase (realtime will also fix it).
if (updated) {
  setMapNotes((prev) =>
    (prev || []).map((n) => (n.id === id ? { ...n, ...updated } : n))
  );
} else {
  throw new Error("Update blocked (no row returned). Check RLS/ownership for this note.");
}

      hideEdit();

      // Rebuild popup HTML (updates By line etc)
      setTimeout(() => openNoteInfo(id, { zoom: false }), 0);
    } catch (e) {
      console.error("Edit note failed:", e);

      // Rollback optimistic UI if DB rejected update
      setMapNotes(prevNotes);
      alert("Couldn’t update note. (Permissions / connection) Try again.");
    } finally {
      try {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      } catch {}
    }
  };
} 

      // If requested (e.g. from Notes list), jump straight into edit mode
      if (opts.startEdit) {
        try {
          showEdit();
        } catch {
          // ignore
        }
      }
    });
  };

  const openNoteComposer = (lat, lng) => {
    const map = mapRef.current;
    if (!map) return;

    // Close other popups (keeps UI calm)
    try {
      infoWindowRef.current?.close();
      hoverInfoWindowRef.current?.close();
      noteInfoWindowRef.current?.close();
    } catch {
      // ignore
    }

    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; font-size: 12px; min-width: 240px;">
        <div data-pw-drag-handle="1" style="font-weight:950; font-size:13px; color:#111;">New note</div>
        <textarea id="note-textarea"
          rows="4"
          placeholder="Type your note…"
          style="width:100%; margin-top:8px; padding:8px; border-radius:10px; border:2px solid #111; font-size:12px; box-sizing:border-box; resize:vertical;"></textarea>
        ${
            selectedPortalJobNumber
              ? `<label style="display:flex; gap:8px; align-items:center; margin-top:8px; font-weight:900; color:#111;">
                   <input id="note-attach-job" type="checkbox" checked />
                   Attach to Job #${selectedPortalJobNumberRef.current}
                 </label>`
              : ``
          }

        <div style="display:flex; gap:8px; margin-top:8px;">
          <button id="note-cancel"
            style="flex:1; padding:7px 8px; border-radius:10px; border:2px solid #111; background:#fff; color:#111; font-weight:900; cursor:pointer;">
            Cancel
          </button>
          <button id="note-save"
            style="flex:1; padding:7px 8px; border-radius:10px; border:2px solid #111; background:#111; color:#fff; font-weight:900; cursor:pointer;">
            Save
          </button>
        </div>
      </div>
    `;

    noteComposerIWRef.current.setContent(html);
    noteComposerIWRef.current.setPosition({ lat, lng });
    noteComposerIWRef.current.open({ map });

    window.google.maps.event.addListenerOnce(noteComposerIWRef.current, "domready", () => {
      setTimeout(makeLatestInfoWindowDraggable, 0);
      const ta = document.getElementById("note-textarea");
      const saveBtn = document.getElementById("note-save");
      const cancelBtn = document.getElementById("note-cancel");

      if (ta) ta.focus();

      if (cancelBtn) cancelBtn.onclick = () => noteComposerIWRef.current?.close();

      if (saveBtn) {
        saveBtn.onclick = async () => {
          const text = (ta?.value || "").trim();
          if (!text) {
            if (ta) ta.style.borderColor = "#d32f2f";
            return;
          }

          // Prevent double-submit
          try {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving…";
          } catch {
            // ignore
          }

          try {
            const attachEl = document.getElementById("note-attach-job");
            const attachToJob = !!(attachEl && attachEl.checked);

          let authUserId = null;
let authUserEmail = null;

try {
  const { data } = await supabase.auth.getUser();
  authUserId = data?.user?.id || null;
  authUserEmail = data?.user?.email || null;
} catch {}

const notePayload = {
  text,
  lat,
  lng,
  // IMPORTANT: make ownership deterministic for RLS
  created_by: authUserId,
  // keep the friendly name you already fetch, but fall back to email
  created_by_name: currentUserName || authUserEmail || null,
};

            // Optional: attach to the currently selected job (recommended)
            const jobIdToAttach = portalSelectedJobIdRef.current;
            const jobNumToAttach = selectedPortalJobNumberRef.current;
            if (attachToJob && jobIdToAttach) {
              notePayload.job_id = jobIdToAttach;
              if (jobNumToAttach) notePayload.job_number = jobNumToAttach;
              else notePayload.job_number = null;
            }

            const { data, error } = await supabase
              .from("map_notes")
              .insert(notePayload)
              .select("id, text, lat, lng, created_at, created_by, created_by_name, job_id, job_number, measure_mode, measure_path")
              .single();

            if (error) throw error;

            // Update local state immediately (realtime will keep others in sync)
            setMapNotes((prev) => {
              const next = [data, ...(prev || []).filter((n) => n.id !== data.id)];
              return next;
            });

            noteComposerIWRef.current?.close();

            // Open the note immediately (feels good)
            setTimeout(() => openNoteInfo(data.id, { zoom: false }), 0);
          } catch (e) {
            console.error("Save note failed:", e);
            alert(`Couldn’t save note: ${e?.message || "unknown error"}`);
          } finally {
            try {
              saveBtn.disabled = false;
              saveBtn.textContent = "Save";
            } catch {
              // ignore
            }
          }
        };
      }
});
  };

  // Keep markers in sync with state
  useEffect(() => {
    syncNoteMarkers(visibleNotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapNotes]);

  // "Add note" mode: tap map to drop a new note
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    // Clean up any existing listener
    if (noteClickListenerRef.current) {
      window.google.maps.event.removeListener(noteClickListenerRef.current);
      noteClickListenerRef.current = null;
    }

    if (!noteAddMode) {
      try {
        map.setOptions({ draggableCursor: null });
      } catch {
        // ignore
      }
      return;
    }

    try {
      map.setOptions({ draggableCursor: "crosshair" });
    } catch {
      // ignore
    }

    noteClickListenerRef.current = map.addListener("click", (e) => {
      const lat = e?.latLng?.lat?.();
      const lng = e?.latLng?.lng?.();
      if (typeof lat === "number" && typeof lng === "number") {
        openNoteComposer(lat, lng);
      }
      setNoteAddMode(false);
      try {
        map.setOptions({ draggableCursor: null });
      } catch {
        // ignore
      }
    });

    return () => {
      if (noteClickListenerRef.current) {
        window.google.maps.event.removeListener(noteClickListenerRef.current);
        noteClickListenerRef.current = null;
      }
      try {
        map.setOptions({ draggableCursor: null });
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteAddMode]);
  // Keep panel behaviour sensible on resize
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 640px)");
    if (!mq) return;

    const onChange = () => {
      const mobile = mq.matches || window.innerWidth <= 640;
      setPanelOpen((prev) => (mobile ? prev : true));
    };

    mq.addEventListener?.("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      mq.removeEventListener?.("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  
  // Selected portal job (used for keeping job number in the search box + attaching notes)
  const selectedPortalJob = useMemo(() => {
    if (!portalSelectedJobId) return null;
    return (portalJobs || []).find((j) => String(j.id) === String(portalSelectedJobId)) || null;
  }, [portalSelectedJobId, portalJobs]);

  const selectedPortalJobNumber = String(selectedPortalJob?.job_number ?? "");

  useEffect(() => {
    portalSelectedJobIdRef.current = portalSelectedJobId || null;
    selectedPortalJobNumberRef.current = String(selectedPortalJobNumber || "");
  }, [portalSelectedJobId, selectedPortalJobNumber]);

  // Notes filter: show notes for current selected job unless "Show All Notes" is ticked
  const visibleNotes = useMemo(() => {
    const all = mapNotes || [];
    // If Show All Notes is ON, always show everything
    if (showAllNotes) return all;

    // If Show All Notes is OFF, only show notes for the currently selected job.
    // If no job is selected, show none (keeps the map clean in the field).
    if (!portalSelectedJobId) return [];

    return all.filter((n) => {
      const jid = n.job_id ?? n.jobId ?? n.job ?? null;
      const jn = n.job_number ?? n.jobNumber ?? "";
      return (
        (jid && String(jid) === String(portalSelectedJobId)) ||
        (selectedPortalJobNumber && String(jn) === String(selectedPortalJobNumber))
      );
    });
  }, [mapNotes, showAllNotes, portalSelectedJobId, selectedPortalJobNumber]);

      // Cache ALL notes (not the filtered view) so edits persist reliably across reloads/filters
  useEffect(() => {
    try {
      localStorage.setItem(MAP_NOTES_CACHE_KEY, JSON.stringify(mapNotes || []));
    } catch {
      // ignore
    }
  }, [mapNotes]);

  // Keep map pins in sync with the filtered notes list
  useEffect(() => {
    try {
      if (!mapRef.current || !window.google?.maps) return;
      syncNoteMarkers(visibleNotes);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNotes]);


// ✅ Suggestions: job_number only
 const jobNumberSuggestions = useMemo(() => {
  const q = String(jobNumberQuery || "").trim();
  if (!q) return [];

  const results = [];

  for (const j of portalJobs || []) {
    if (String(j.job_number ?? "").includes(q)) {
      results.push(j);
      if (results.length >= 12) break;
    }
  }

  return results;
}, [jobNumberQuery, portalJobs]);

  // ✅ Reset keyboard highlight when query/suggestions change
  useEffect(() => {
    setJobNumberActiveIndex(-1);
  }, [jobNumberQuery, jobPicked, jobNumberSuggestions.length]);

  // Initialise map once
  useEffect(() => {
    if (!window.google || !mapDivRef.current || mapRef.current) return;

  const mobile =
  typeof window !== "undefined" &&
  window.innerWidth <= 900;

    const persisted = safeReadState() || {};
    const startCenter =
      persisted?.mapCenter && typeof persisted.mapCenter.lat === "number"
        ? persisted.mapCenter
        : { lat: -31.95, lng: 115.86 };
    const startZoom =
      typeof persisted?.mapZoom === "number" ? persisted.mapZoom : 10;
    const startMapType =
      typeof persisted?.mapTypeId === "string" ? persisted.mapTypeId : "hybrid";

   const map = new window.google.maps.Map(mapDivRef.current, {
  center: startCenter,
  zoom: startZoom,
  mapTypeId: startMapType,
  mapTypeControl: true,
  fullscreenControl: true,
  streetViewControl: true,
  clickableIcons: false,
  controlSize: mobile ? 24 : 28,
  gestureHandling: "greedy",
  tilt: 0,
});

    mapRef.current = map;
    map.setTilt(0);

    map.addListener("tilt_changed", () => {
  if (map.getTilt() !== 0) {
    map.setTilt(0);
  }
});
infoWindowRef.current = new window.google.maps.InfoWindow({
  maxWidth: isSmallScreen() ? 260 : 340,
  disableAutoPan: true,
});

window.google.maps.event.addListener(infoWindowRef.current, "closeclick", () => {
  mainInfoOpenRef.current = false;
  activeMainInfoKeyRef.current = null;
  activeMainInfoLayerRef.current = null;
});
    hoverInfoWindowRef.current = new window.google.maps.InfoWindow({
      disableAutoPan: true,
    });
    noteInfoWindowRef.current = new window.google.maps.InfoWindow();
    noteComposerIWRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });
    addressInfoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });

    // ✅ Render saved notes immediately
    try {
      syncNoteMarkers(visibleNotes);
    } catch {
      // ignore
    }

    map.addListener("click", (e) => {
  if (!infoModeRef.current) return;
  if (!e?.latLng) return;

  const html = buildMapInfoPopupHtml(e.latLng);

  infoWindowRef.current?.setContent(html);
  infoWindowRef.current?.setPosition(e.latLng);
  infoWindowRef.current?.open({ map });

  window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
    setTimeout(makeLatestInfoWindowDraggable, 0);
  });
});
 
    // Persist view/type on idle + tick
map.addListener("idle", () => {
  if (idleDebounceRef.current) clearTimeout(idleDebounceRef.current);

  idleDebounceRef.current = setTimeout(() => {
    if (!mapRef.current) return;

    const b = mapRef.current.getBounds();
    const z = mapRef.current.getZoom();
    viewRef.current = { bounds: b, zoom: z };

    const c = mapRef.current.getCenter();
    safeWriteState({
      mapCenter: { lat: c.lat(), lng: c.lng() },
      mapZoom: z,
      mapTypeId: mapRef.current.getMapTypeId(),
    });

    // Don’t refresh point layers while the main popup is open
    if (mainInfoOpenRef.current) return;

    setViewTick((t) => t + 1);
  }, REFRESH_DEBOUNCE_MS);
});
  }, []);
  // Pause Google Maps interaction when app is backgrounded (mobile battery saver)
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (!isAppVisible) {
    map.setOptions({
      gestureHandling: "none",
      draggable: false,
      clickableIcons: false,
    });
  } else {
    map.setOptions({
      gestureHandling: "greedy",
      draggable: true,
      clickableIcons: false,
    });
  }
}, [isAppVisible]);


  // ✅ FIX: attach Places Autocomplete whenever the Job Layers tab is visible (input exists)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeTab !== "jobLayers") return;

    const input = addressInputRef.current;
    if (!input) return;

    if (!window.google?.maps?.places?.Autocomplete) return;

    if (addressAutocompleteRef.current) return;

    // WA bounds (rough SW -> NE). Keeps suggestions inside WA.
const waBounds = new window.google.maps.LatLngBounds(
  new window.google.maps.LatLng(-35.2, 112.9), // SW corner (near south coast)
  new window.google.maps.LatLng(-13.5, 129.0)  // NE corner (Kimberley / NT border-ish)
);

   const autocomplete = new window.google.maps.places.Autocomplete(input, {
  types: ["geocode"],
  componentRestrictions: { country: "au" },
  bounds: waBounds,
  strictBounds: true,
  fields: ["geometry", "formatted_address", "name", "address_components"],
});

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      // Hard-stop if user selects something outside WA (extra safety)
const isWA = (place?.address_components || []).some((c) =>
  (c.types || []).includes("administrative_area_level_1") &&
  (c.short_name === "WA" || c.long_name === "Western Australia")
);

if (!isWA) {
  // clear input + do nothing
  input.value = "";
  return;
}
      if (!place?.geometry?.location) return;

      const loc = place.geometry.location;
      const position = { lat: loc.lat(), lng: loc.lng() };

      map.setCenter(position);
      map.setZoom(17);

      const addressString =
        place.formatted_address || place.name || "Selected location";

      if (!addressMarkerRef.current) {
        addressMarkerRef.current = new window.google.maps.Marker({
          position,
          map,
          title: addressString,
          icon: {
            path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            fillColor: "#ffb300",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1,
            scale: 6,
          },
        });
      } else {
        addressMarkerRef.current.setPosition(position);
        addressMarkerRef.current.setTitle(addressString);
        if (!addressMarkerRef.current.getMap()) addressMarkerRef.current.setMap(map);
      }

      setSelectedAddress({
        address: addressString,
        lat: position.lat,
        lng: position.lng,
      });
      openAddressInfo(addressString, position, addressMarkerRef.current);
    });
    
    addressAutocompleteRef.current = autocomplete;
  }, [activeTab]);

   // Keep top tools visual state in sync
  useEffect(() => {
    const div = toolsControlDivRef.current;
    if (!div) return;

    const btns = Array.from(div.querySelectorAll("button"));
    btns.forEach((b) => {
      const action = b.dataset.action;
     const active =
  (action === "distance" && measureMode === "distance") ||
  (action === "area" && measureMode === "area") ||
  (action === "location" && isFollowingLocation) ||
  (action === "info" && infoMode) ||
  (
    action === "export" &&
    (exportPanelOpen || !!exportMode || exportHasFence || exportDialogOpen)
  );

      b.style.background = active ? "#000" : "#fff";
      b.style.color = active ? "#fff" : "#000";
    });

    const clearBtn = div.querySelector('button[data-action="clear"]');
    if (clearBtn) clearBtn.style.display = hasMeasure ? "grid" : "none";

    const finishBtn = div.querySelector('button[data-action="finish"]');
    if (finishBtn) finishBtn.style.display = measureMode ? "grid" : "none";
  }, [
    measureMode,
    hasMeasure,
    isFollowingLocation,
    exportPanelOpen,
    exportMode,
    exportHasFence,
    exportDialogOpen,
    infoMode,
  ]);


  /* ======================================
     ✅ Portal Jobs: fetch + FAST rendering
     ====================================== */
  const fetchPortalJobs = async () => {
    setPortalJobsLoading(true);
    setPortalJobsError("");

    try {
      const { data, error } = await supabase
        .from("jobs")
        .select(
  "id, job_number, client_name, status, full_address, suburb, local_authority, job_type_legacy, assigned_to, mga_zone, mga_easting, mga_northing, place_id"
)
        .not("mga_zone", "is", null)
        .not("mga_easting", "is", null)
        .not("mga_northing", "is", null)
        .order("job_number", { ascending: false })
        .limit(99999);

      if (error) throw error;

      const arr = Array.isArray(data) ? data : [];
      setPortalJobs(
  arr.sort((a, b) => Number(b.job_number) - Number(a.job_number))
);

      // Build fast lookup caches (no markers created here)
      const byId = new Map();
      const pts = new Map();
      for (const j of arr) {
        byId.set(j.id, j);
        const pt = mgaToWgs84(j.mga_zone, j.mga_easting, j.mga_northing);
        if (pt) pts.set(j.id, pt);
      }
      portalJobsByIdRef.current = byId;
      portalPointsByIdRef.current = pts;
    } catch (e) {
      console.warn("Portal jobs fetch failed:", e);
      setPortalJobsError(e?.message || "Failed to load portal jobs.");
      setPortalJobs([]);
      portalJobsByIdRef.current = new Map();
      portalPointsByIdRef.current = new Map();
    } finally {
      setPortalJobsLoading(false);
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;
    fetchPortalJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensurePortalClusterer = () => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (!portalClustererRef.current) {
      portalClustererRef.current = new MarkerClusterer({ map, markers: [] });
    } else {
      portalClustererRef.current.setMap(map);
    }
  };

  const getPortalIcon = (color, mobileScale = null) => {
    const mobile =
  typeof window !== "undefined" &&
  window.innerWidth <= 900;
    const scale = mobileScale ?? (mobile ? 4.2 : 4.8); // small pins
    return {
      path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
      fillColor: color,
      fillOpacity: 0.95,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      scale,
    };
  };

  const openAddressInfo = (addressString, position, marker) => {
  const map = mapRef.current;
  if (!map || !window.google) return;

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; font-size: 13px; min-width: 250px;">
      <div data-pw-drag-handle="1" style="font-weight:900; font-size:14px; margin-bottom:6px; color:#111;">
        Address
      </div>
      <div style="color:#111; margin-top:6px;">${addressString || "—"}</div>

      <div style="display:flex; gap:8px; margin-top:10px;">
        <a href="${buildSearchUrl(addressString)}" target="_blank" rel="noreferrer"
           style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                  border:1px solid #ccc; color:#111; background:#fff; font-weight:900; font-size:12px;">
          🔍 Maps
        </a>
        <a href="${buildDirectionsUrl(position.lat, position.lng)}" rel="noreferrer"
           style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                  border:1px solid #111; color:#fff; background:#111; font-weight:900; font-size:12px;">
          🚗 Directions
        </a>
      </div>
    </div>
  `;

  addressInfoWindowRef.current?.setContent(html);
  addressInfoWindowRef.current?.open({ anchor: marker, map });

  window.google.maps.event.addListenerOnce(addressInfoWindowRef.current, "domready", () => {
    setTimeout(makeLatestInfoWindowDraggable, 0);
  });
};

function buildMapInfoPopupHtml(latLng) {
  const googleMaps = window.google?.maps;
  if (!googleMaps) return "";

  if (!googleMaps.geometry?.poly) {
    return `
      <div style="font-family:Inter,sans-serif; font-size:12px; max-width:260px;">
        <div data-pw-drag-handle="1" style="font-weight:900; font-size:13px; margin-bottom:6px;">
          Map Information
        </div>
        <div style="color:#8a1f1f; font-weight:800;">
          Google Maps geometry library is not loaded.
        </div>
      </div>
    `;
  }

const visiblePolygonLayers = (layersRef.current || []).filter(
  (l) => l.type === "polygon" && l.visible
);
  const sections = [];

  visiblePolygonLayers.forEach((layer) => {
    const store = polygonLayersRef.current.get(layer.id);
    if (!store?.polygons) return;

    let matchedFeature = null;

    store.polygons.forEach((feature) => {
      if (matchedFeature) return;

      if (dataPolygonFeatureContainsLatLng(feature, latLng, googleMaps)) {
        matchedFeature = feature;
      }
    });

    if (!matchedFeature) return;

  const infoFields = layer.data?.infoFields || [];

const props = {};
matchedFeature.forEachProperty((value, key) => {
  props[key] = value;
});

const rows = infoFields
  .map(({ key, label }) => {
    const value = props[key];

    if (value === null || value === undefined || String(value).trim() === "") {
      return "";
    }

    return `
      <div style="margin-top:5px;">
        <div style="font-weight:900; color:#333;">${escapeHtml(label || key)}</div>
        <div style="color:#111; word-break:break-word;">${escapeHtml(value)}</div>
      </div>
    `;
  })
  .filter(Boolean);

    sections.push(`
      <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);">
        <div style="font-weight:950; font-size:13px; color:#111;">
          ${escapeHtml(layer.name)}
        </div>
        ${
          rows.length
            ? rows.join("")
            : `<div style="margin-top:5px; color:#666; font-weight:800;">No selected attributes found.</div>`
        }
      </div>
    `);
  });

  if (!sections.length) {
    return `
      <div style="font-family:Inter,sans-serif; font-size:12px; max-width:260px;">
        <div data-pw-drag-handle="1" style="font-weight:900; font-size:13px; margin-bottom:6px;">
          Map Information
        </div>
        <div style="color:#666; font-weight:800;">
          No visible polygon data found at this point.
        </div>
        <div style="margin-top:6px; color:#666;">
          Turn on Cadastre, Local Authority, or R-Codes Zoning first.
        </div>
      </div>
    `;
  }

  return `
    <div style="font-family:Inter,sans-serif; font-size:12px; max-width:280px; max-height:300px; overflow:auto;">
      <div data-pw-drag-handle="1" style="font-weight:950; font-size:14px; margin-bottom:6px;">
        Map Information
      </div>
      ${sections.join("")}
    </div>
  `;
}

function stopInfoMode() {
  infoModeRef.current = false;
  setInfoMode(false);

  try {
    mapRef.current?.setOptions({ draggableCursor: null });
  } catch {
    // ignore
  }
}

function toggleInfoMode() {
  clearMeasure();
  clearExportInteraction();
  setNoteAddMode(false);

  const next = !infoModeRef.current;
  infoModeRef.current = next;
  setInfoMode(next);

  try {
    mapRef.current?.setOptions({ draggableCursor: next ? "help" : null });
  } catch {
    // ignore
  }
}

function openMainInfoWindow({ html, marker, markerId, layerId }) {
  const map = mapRef.current;
  if (!map || !window.google || !infoWindowRef.current) return;

  try {
    infoWindowRef.current.close();
  } catch {
    // ignore
  }

  mainInfoOpenRef.current = true;
  activeMainInfoKeyRef.current = `${layerId}::${markerId}`;
  activeMainInfoLayerRef.current = layerId;

  infoWindowRef.current.setContent(html);
  infoWindowRef.current.open({ anchor: marker, map });

  window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
    setTimeout(() => {
      makeLatestInfoWindowDraggable();
    }, 0);
  });
}

  const openPortalInfo = (job, pt, marker) => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    const safeClient = job.client_name || "—";
    const safeAddr = job.full_address || "—";
    const safeStatus = job.status || "Planned";
   
    const safeAssigned =
  job.assigned_to || job.assigned_to_name || job.assigned || "—";

const safeJobType =
  job.job_type || job.job_type_legacy || job.type || "—";

const safeLA =
  job.local_authority || job.lga || job.council || "—";


    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; font-size: 13px; min-width: 250px;">
        <div data-pw-drag-handle="1" style="font-weight:900; font-size:14px; margin-bottom:6px; color:#111;">
          Job #${job.job_number}
        </div>
        <div style="font-weight:800; color:#333;">
  ${safeClient} · ${safeStatus}
</div>

<div style="color:#111; margin-top:6px;">${safeAddr}</div>

<div style="margin-top:8px; font-size:12px; color:#333;">
  <div><span style="font-weight:900;">Assigned:</span> ${safeAssigned}</div>
  <div><span style="font-weight:900;">Job type:</span> ${safeJobType}</div>
  <div><span style="font-weight:900;">Local authority:</span> ${safeLA}</div>
</div>

        <div style="display:flex; gap:8px; margin-top:10px;">
          <a href="${buildLatLngSearchUrl(pt.lat, pt.lng)}" target="_blank" rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                    border:1px solid #ccc; color:#111; background:#fff; font-weight:900; font-size:12px;">
            🔍 Maps
          </a>
          <a href="${buildDirectionsUrl(pt.lat, pt.lng)}" rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                    border:1px solid #111; color:#fff; background:#111; font-weight:900; font-size:12px;">
            🚗 Directions
          </a>
        </div>

        <div style="margin-top:10px;">
          <button id="open-job-register"
            style="width:100%; padding:8px 10px; border-radius:10px; border:2px solid #000;
                   background:#fff; color:#000; font-weight:900; cursor:pointer;">
            Open job register
          </button>
        </div>
      </div>
    `;

    infoWindowRef.current.setContent(html);
    infoWindowRef.current.open({ anchor: marker, map });

    window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
      setTimeout(makeLatestInfoWindowDraggable, 0);
      const btn = document.getElementById("open-job-register");
      if (btn) btn.onclick = () => navigate(`/jobs?job=${encodeURIComponent(job.job_number)}&from=maps&edit=1`);
});
  };

  const openPortalHover = (job, pt, marker) => {
  const map = mapRef.current;
  if (!map) return;

  const safeClient = job.client_name || "—";
  const safeAddr = job.full_address || "—";
  const safeJobType = job.job_type_legacy || "—";

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; font-size: 12px; min-width: 230px;">
      <div style="font-weight:900; font-size:13px; color:#111;">Job #${job.job_number}</div>
      <div style="font-weight:800; color:#333; margin-top:2px;">${safeClient}</div>
      <div style="color:#111; margin-top:2px;">${safeAddr}</div>
      <div style="color:#333; margin-top:5px; font-weight:800;">
        Type: ${safeJobType}
      </div>
    </div>
  `;

  hoverInfoWindowRef.current.setContent(html);
  hoverInfoWindowRef.current.open({ anchor: marker, map });
};

  const closePortalHover = () => {
    try {
      hoverInfoWindowRef.current?.close();
    } catch {
      // ignore
    }
  };

  const getOrCreatePortalMarker = (id) => {
    const map = mapRef.current;
    if (!map || !window.google) return null;

    const job = portalJobsByIdRef.current.get(id);
    const pt = portalPointsByIdRef.current.get(id);
    if (!job || !pt) return null;

    let marker = portalMarkersByIdRef.current.get(id);
    if (!marker) {
 const safeClient = job.client_name || "—";
const safeAddr = job.full_address || "—";
const safeJobType = job.job_type_legacy || "—";

marker = new window.google.maps.Marker({
  position: pt,
  map: null,
  title: `Job #${job.job_number}\n${safeClient}\n${safeAddr}\nType: ${safeJobType}`,
  optimized: true,
  icon: getPortalIcon("#d32f2f"),
});

      marker.addListener("click", () => {
        setPortalSelectedJobId(id);
        // Keep the selected job visible in the job number search box
        setJobNumberQuery(String(job?.job_number ?? ""));
        setJobPicked(true);
        openPortalInfo(job, pt, marker);
      });

      portalMarkersByIdRef.current.set(id, marker);
    }

    // Update icon for selected vs not
    const isSelected = String(id) === String(portalSelectedJobId);
    marker.setIcon(getPortalIcon(isSelected ? "#1b8f2e" : "#d32f2f")); // ✅ selected job green

    return marker;
  };

  const setPortalMarkersVisibility = (desiredIds, cluster) => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    // Hide removed
    for (const id of portalVisibleIdsRef.current) {
      if (!desiredIds.has(id)) {
        const m = portalMarkersByIdRef.current.get(id);
        if (m) m.setMap(null);
      }
    }

    // Show desired
    const desiredMarkers = [];
    for (const id of desiredIds) {
      const m = getOrCreatePortalMarker(id);
      if (!m) continue;
      if (!m.getMap()) m.setMap(map);
      desiredMarkers.push(m);
    }

    portalVisibleIdsRef.current = desiredIds;

    ensurePortalClusterer();
    if (!portalClustererRef.current) return;

    portalClustererRef.current.clearMarkers();

    // Only cluster when showing "all jobs"
    if (cluster && desiredMarkers.length) {
      portalClustererRef.current.addMarkers(desiredMarkers);
    }
  };

  // ✅ KEY PERFORMANCE FIX:
  // Only render portal markers in current view when "All Jobs" is ON.
  // When OFF, show ONLY the searched/selected job (if any).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (!portalJobs?.length) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const desiredIds = new Set();

    if (showAllPortalJobs) {
      // only within current bounds (fast)
      for (const j of portalJobs) {
        const pt = portalPointsByIdRef.current.get(j.id);
        if (!pt) continue;
        if (bounds.contains(new window.google.maps.LatLng(pt.lat, pt.lng))) {
          desiredIds.add(j.id);
        }
      }
      // Keep selected marker visible even if just outside bounds (nice UX)
      if (portalSelectedJobId && portalPointsByIdRef.current.get(portalSelectedJobId)) {
        desiredIds.add(portalSelectedJobId);
      }
      setPortalMarkersVisibility(desiredIds, true);
    } else {
      // Only current job (if selected)
      if (portalSelectedJobId && portalPointsByIdRef.current.get(portalSelectedJobId)) {
        desiredIds.add(portalSelectedJobId);
      }
      setPortalMarkersVisibility(desiredIds, false);
    }
  }, [portalJobs, showAllPortalJobs, portalSelectedJobId, viewTick]);

  // Pan/zoom to selected portal job (without creating 5000 markers)
  const focusPortalJob = (job) => {
    const map = mapRef.current;
    if (!map) return;
    const pt = portalPointsByIdRef.current.get(job.id);
    if (!pt) return;

    // ✅ Smoothly centre and zoom in a touch more on the selected job
    const targetZoom = 18; // was 15
    map.panTo(pt);
    const current = map.getZoom() || targetZoom;
    map.setZoom(Math.max(current, targetZoom));
  };

const handleSelectPortalJob = (job) => {
  setPortalSelectedJobId(job.id);
  focusPortalJob(job);

  // Open the summary popup automatically after the map recentres
  setTimeout(() => {
    const pt = portalPointsByIdRef.current.get(job.id);
    const marker = getOrCreatePortalMarker(job.id);

    if (pt && marker) {
      openPortalInfo(job, pt, marker);
    }
  }, 100);
};

  // ✅ Deep link from Jobs page (same-tab navigation)
  const deepLinkDoneRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    const params = new URLSearchParams(location.search || "");
    const hasAnything =
      params.has("job") ||
      params.has("place_id") ||
      (params.has("zone") && params.has("e") && params.has("n")) ||
      params.has("address");

    if (!hasAnything) return;
    if (deepLinkDoneRef.current) return;

    const jobNumStr = params.get("job") || "";
    const placeId = params.get("place_id") || "";
    const zone = params.get("zone");
    const e = params.get("e");
    const n = params.get("n");

    const trySelectByJobNumber = () => {
      const jn = Number(jobNumStr);
      if (!Number.isFinite(jn)) return false;

      const match = (portalJobs || []).find((j) => Number(j.job_number) === jn);
      if (match) {
        setPortalSelectedJobId(match.id);
        setJobNumberQuery(String(match.job_number ?? ""));
        setJobPicked(true);

        // respect current All Jobs toggle:
        // - if ON -> many markers in view
        // - if OFF -> only this marker
        focusPortalJob(match);

        deepLinkDoneRef.current = true;
        return true;
      }
      return false;
    };

    if (portalJobs?.length) {
      const ok = trySelectByJobNumber();
      if (ok) return;
    }

    if (zone && e && n) {
      const pt = mgaToWgs84(zone, e, n);
      if (pt) {
        map.setCenter(pt);
        map.setZoom(17);

        if (!addressMarkerRef.current) {
          addressMarkerRef.current = new window.google.maps.Marker({
            position: pt,
            map,
            title: jobNumStr ? `Job #${jobNumStr}` : "Selected job",
            icon: {
              path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              fillColor: "#ffb300",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 1,
              scale: 6,
            },
          });
        } else {
          addressMarkerRef.current.setPosition(pt);
          addressMarkerRef.current.setTitle(
            jobNumStr ? `Job #${jobNumStr}` : "Selected job"
          );
          if (!addressMarkerRef.current.getMap()) addressMarkerRef.current.setMap(map);
        }

        deepLinkDoneRef.current = true;
        return;
      }
    }

    if (placeId && window.google?.maps?.places?.PlacesService) {
      const service = new window.google.maps.places.PlacesService(map);
      service.getDetails(
        { placeId, fields: ["geometry", "formatted_address", "name"] },
        (place, status) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK) return;
          const loc = place?.geometry?.location;
          if (!loc) return;

          const pt = { lat: loc.lat(), lng: loc.lng() };
          map.setCenter(pt);
          map.setZoom(17);

          const label =
            place.formatted_address ||
            place.name ||
            (jobNumStr ? `Job #${jobNumStr}` : "Selected job");

          if (!addressMarkerRef.current) {
            addressMarkerRef.current = new window.google.maps.Marker({
              position: pt,
              map,
              title: label,
              icon: {
                path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                fillColor: "#ffb300",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 1,
                scale: 6,
              },
            });
          } else {
            addressMarkerRef.current.setPosition(pt);
            addressMarkerRef.current.setTitle(label);
            if (!addressMarkerRef.current.getMap()) addressMarkerRef.current.setMap(map);
          }

          deepLinkDoneRef.current = true;
        }
      );

      return;
    }
  }, [location.search, portalJobs]);

const stopFollowingLocation = () => {
  if (locationWatchIdRef.current !== null) {
    navigator.geolocation.clearWatch(locationWatchIdRef.current);
    locationWatchIdRef.current = null;
  }
  setIsFollowingLocation(false);
};



const handleMyLocation = () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your device.");
    return;
  }

  const map = mapRef.current;
  if (!map) return;

  // Toggle off if already following
  if (locationWatchIdRef.current !== null) {
    stopFollowingLocation();
    return;
  }

  setIsFollowingLocation(true);

  locationWatchIdRef.current = navigator.geolocation.watchPosition(
    (pos) => {
      const liveMap = mapRef.current;
      if (!liveMap) return;

      const position = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      liveMap.setCenter(position);
      liveMap.setZoom(Math.max(liveMap.getZoom() || 17, 17));

      if (!userLocationMarkerRef.current) {
        userLocationMarkerRef.current = new window.google.maps.Marker({
          position,
          map: liveMap,
          title: "Your Location",
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 7,
          },
        });
      } else {
        userLocationMarkerRef.current.setPosition(position);
        if (!userLocationMarkerRef.current.getMap()) {
          userLocationMarkerRef.current.setMap(liveMap);
        }
      }
    },
        (err) => {
      stopFollowingLocation();

      if (err?.code === 1) {
        alert("Location permission was denied on this device/browser.");
      } else if (err?.code === 2) {
        alert("Your location is currently unavailable. Try again in a moment.");
      } else if (err?.code === 3) {
        alert("Location request timed out. Try again in an open area or with better signal.");
      } else {
        alert("Unable to track your location on this device.");
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    }
  );
};

  // ---------------- Measurement (custom) ----------------
  const clearMeasureListeners = () => {
    if (!window.google) return;
    measureListenersRef.current.forEach((l) =>
      window.google.maps.event.removeListener(l)
    );
    measureListenersRef.current = [];
  };

  const clearMeasure = () => {
    clearMeasureListeners();
    measurePathRef.current = [];

    if (measureLineRef.current) {
      measureLineRef.current.setMap(null);
      measureLineRef.current = null;
    }
    if (measurePolyRef.current) {
      measurePolyRef.current.setMap(null);
      measurePolyRef.current = null;
    }
    if (measureLiveIWRef.current) measureLiveIWRef.current.close();
    if (measureFinalIWRef.current) measureFinalIWRef.current.close();

    measureModeRef.current = null;
    setMeasureMode(null);
    setHasMeasure(false);
  };



  const getMeasureSaveLatLng = (pathLatLngs, mode) => {
    try {
      if (!pathLatLngs || pathLatLngs.length === 0) return null;

      // For distance, try to find the halfway point along the polyline length
      if (
        mode === "distance" &&
        window.google?.maps?.geometry?.spherical &&
        pathLatLngs.length >= 2
      ) {
        const spherical = window.google.maps.geometry.spherical;
        const total = spherical.computeLength(pathLatLngs);
        const half = total / 2;

        let run = 0;
        for (let i = 1; i < pathLatLngs.length; i++) {
          const a = pathLatLngs[i - 1];
          const b = pathLatLngs[i];
          const seg = spherical.computeDistanceBetween(a, b);
          if (run + seg >= half) {
            const t = seg > 0 ? (half - run) / seg : 0;
            return spherical.interpolate(a, b, t);
          }
          run += seg;
        }
        return pathLatLngs[Math.floor(pathLatLngs.length / 2)];
      }

      // For area (and as a robust fallback), use the bounds center
      if (window.google?.maps?.LatLngBounds) {
        const b = new window.google.maps.LatLngBounds();
        pathLatLngs.forEach((p) => b.extend(p));
        const c = b.getCenter();
        return c || pathLatLngs[Math.floor(pathLatLngs.length / 2)];
      }

      return pathLatLngs[Math.floor(pathLatLngs.length / 2)];
    } catch {
      return pathLatLngs?.[Math.floor((pathLatLngs?.length || 1) / 2)] || null;
    }
  };

  const saveCurrentMeasurementAsNote = async (attachToJob = true) => {
    try {
      const summary = lastMeasureSummaryRef.current;
      const pos = lastMeasureLatLngRef.current;
      if (!summary || !pos) return;


      // Ensure we have an auth user id (RLS often requires created_by = auth.uid())
      let authUserId = currentUserId || null;
      let authUserName = currentUserName || null;
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) authUserId = data.user.id;
        if (!authUserName) authUserName = data?.user?.email || data?.user?.id || "";
      } catch {
        // ignore
      }

      if (lastMeasureSavedRef.current) return;
      lastMeasureSavedRef.current = true;

      const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
      const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;

      const notePayload = {
        text: summary.plainText || "Measurement",
        lat,
        lng,
        created_by: authUserId,
        created_by_name: authUserName || null,
        measure_mode: summary.mode || null,
        measure_path: (measurePathRef.current || []).map((p) => ({ lat: p.lat(), lng: p.lng() })),
      };

      const jobIdToAttach = portalSelectedJobIdRef.current;
      const jobNumToAttach = selectedPortalJobNumberRef.current;

      if (attachToJob && jobIdToAttach) {
        notePayload.job_id = jobIdToAttach;
        if (jobNumToAttach) notePayload.job_number = jobNumToAttach;
      }

      const { data, error } = await supabase
        .from("map_notes")
        .insert(notePayload)
        .select("id, text, lat, lng, created_at, created_by, created_by_name, job_id, job_number, measure_mode, measure_path")
        .single();

      if (error) throw error;


      // Create a persistent overlay for this measurement and tie it to the note id
      try {
        const map = mapRef.current;
        const summaryMode = summary?.mode;
        const pathLatLngs = (measurePathRef.current || []).slice();
        if (map && pathLatLngs.length >= 2) {
          // Remove any existing overlay for this note id
          const existing = measureOverlaysByNoteIdRef.current.get(data.id);
          if (existing) {
            try { existing.setMap(null); } catch {}
          }

          if (summaryMode === "distance") {
            const pl = new window.google.maps.Polyline({
              map: null,
              path: pathLatLngs,
              strokeColor: "#d32f2f",
              strokeOpacity: 1,
              strokeWeight: 2,
              clickable: false,
            });
            measureOverlaysByNoteIdRef.current.set(data.id, pl);
          } else if (summaryMode === "area") {
            const pg = new window.google.maps.Polygon({
              map: null,
              paths: pathLatLngs,
              strokeColor: "#d32f2f",
              strokeOpacity: 1,
              strokeWeight: 2,
              fillColor: "#d32f2f",
              fillOpacity: 0.12,
              clickable: false,
            });
            measureOverlaysByNoteIdRef.current.set(data.id, pg);
          }
        }
      } catch {
        // ignore overlay errors
      }

      setMapNotes((prev) => [data, ...(prev || [])]);

      setTimeout(() => {
        try {
          openNoteInfo(data.id, { zoom: false });
        } catch {
          // ignore
        }
      }, 0);
    } catch (e) {
      console.error("Save measurement note failed:", e);
      lastMeasureSavedRef.current = false;
      alert(`Couldn’t save measurement note: ${e?.message || "unknown error"}`);
    }
  };

  const updateLiveMeasure = (lastLatLng) => {
    const map = mapRef.current;
    const path = measurePathRef.current;

    if (!map || path.length < 2) return;

    let value = 0;
    if (window.google.maps.geometry && window.google.maps.geometry.spherical) {
      if (measureModeRef.current === "distance") {
        value = window.google.maps.geometry.spherical.computeLength(path);
      } else {
        value = window.google.maps.geometry.spherical.computeArea(path);
      }
    } else {
      const arr = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
      value =
        measureModeRef.current === "distance"
          ? approxPathLengthMeters(arr)
          : approxPolygonAreaM2(arr);
    }


    let segmentMeters = 0;
    if (measureModeRef.current === "distance" && path.length >= 2) {
      const a = path[path.length - 2];
      const b = path[path.length - 1];
      if (window.google.maps.geometry && window.google.maps.geometry.spherical) {
        segmentMeters = window.google.maps.geometry.spherical.computeDistanceBetween(a, b);
      } else {
        segmentMeters = haversineMeters(
          { lat: a.lat(), lng: a.lng() },
          { lat: b.lat(), lng: b.lng() }
        );
      }
    }

    let label = "";
    if (measureModeRef.current === "distance") {
      const totalMeters = value;

      const segText =
        segmentMeters >= 1000
          ? `${segmentMeters.toFixed(2)} m (${(segmentMeters / 1000).toFixed(3)} km)`
          : `${segmentMeters.toFixed(2)} m`;

      const totalText =
        totalMeters >= 1000
          ? `${totalMeters.toFixed(2)} m (${(totalMeters / 1000).toFixed(3)} km)`
          : `${totalMeters.toFixed(2)} m`;

      label = `Segment: ${segText}<br/>Total: ${totalText}`;
    } else {
      const areaM2 = value;
      const hectares = areaM2 / 10000;
      label =
        areaM2 >= 1_000_000
          ? `${areaM2.toFixed(0)} m² (${hectares.toFixed(2)} ha)`
          : `${areaM2.toFixed(1)} m² (${hectares.toFixed(3)} ha)`;
      label = `Area: ${label}`;
    }

    if (!measureLiveIWRef.current) {
      measureLiveIWRef.current = new window.google.maps.InfoWindow();
    }
    const hint = isSmallScreen() ? "Tap ✔ Finish to complete" : "Right-click to finish";
    // Store last measurement summary so we can save it as a map note
    const plainText = (() => {
      try {
        const tmp = String(label || "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .trim();
        const modePrefix = measureModeRef.current === "distance" ? "Distance measurement" : "Area measurement";
        return `${modePrefix}\n${tmp}`;
      } catch {
        return "Measurement";
      }
    })();
    lastMeasureSummaryRef.current = { mode: measureModeRef.current, htmlLabel: label, plainText };
    lastMeasureLatLngRef.current = lastLatLng;
    measureLiveIWRef.current.setContent(
      `<div style="font-weight:900; font-size:13px;">${label}<br/><span style="font-weight:700; color:#666;">${hint}</span></div>`
    );
    measureLiveIWRef.current.setPosition(lastLatLng);
    measureLiveIWRef.current.open(map);
  };

    const finishMeasure = () => {
    const map = mapRef.current;
    const path = measurePathRef.current;
    if (!map || path.length < 2) return;

    // Render the final readout at the last point
    const last = path[path.length - 1];
    updateLiveMeasure(last);

    // Save position: midpoint (distance: halfway along line; area: bounds center)
    const savePos = getMeasureSaveLatLng(path, lastMeasureSummaryRef.current?.mode || "area");
    if (savePos) lastMeasureLatLngRef.current = savePos;

    clearMeasureListeners();
    setHasMeasure(true);
    setMeasureMode(null);
    measureModeRef.current = null;

    // Promote the live InfoWindow to the final one
    measureFinalIWRef.current = measureLiveIWRef.current;
    measureLiveIWRef.current = null;

    // Reset "saved" state for this measurement
    lastMeasureSavedRef.current = false;

    // Replace content to include a Save button (touch-friendly)
    try {
      const summary = lastMeasureSummaryRef.current;
      const htmlLabel = summary?.htmlLabel || "";
      const hintFinal = isSmallScreen()
        ? "Tap ✖ Clear to remove"
        : "Use ✖ Clear to remove (or start a new measure)";

      const btnId = `save-measure-note-${Date.now()}`;

      measureFinalIWRef.current.setContent(
        `<div data-pw-drag-handle="1" style="font-weight:900; font-size:13px;">
          ${htmlLabel}<br/>
          ${
            selectedPortalJobNumberRef.current
              ? `<label style="display:flex; gap:8px; align-items:center; margin-top:8px; font-weight:900; color:#111;">
                   <input id="save-measure-attach-job" type="checkbox" checked />
                   Attach to Job #${selectedPortalJobNumberRef.current || "—"}
                 </label>`
              : `<input id="save-measure-attach-job" type="checkbox" style="display:none" />`
          }
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button id="${btnId}"
              style="flex:1; padding:7px 8px; border-radius:10px; border:2px solid #111; background:#111; color:#fff; font-weight:900; cursor:pointer; font-size:12px;">
              Save as note
            </button>
          </div>
          <div style="margin-top:6px; font-weight:700; color:#666; font-size:12px;">${hintFinal}</div>
        </div>`
      );

      window.google.maps.event.addListenerOnce(measureFinalIWRef.current, "domready", () => {
        setTimeout(makeLatestInfoWindowDraggable, 0);
        const btn = document.getElementById(btnId);
        if (!btn) return;

        btn.onclick = async () => {
          const attachEl = document.getElementById("save-measure-attach-job");
          const attachToJob = attachEl ? !!attachEl.checked : false;
          try {
            btn.disabled = true;
            btn.textContent = "Saving…";
          } catch {
            // ignore
          }

          await saveCurrentMeasurementAsNote(attachToJob);

          try {
            btn.textContent = "Saved ✓";
          } catch {
            // ignore
          }
        };
      });
    } catch {
      // ignore
    }
  };

   const startDistanceMeasure = () => {
    clearExportInteraction();
    clearMeasure();
    const map = mapRef.current;
    if (!map || !window.google) return;

    measureModeRef.current = "distance";
    setMeasureMode("distance");

    measureLineRef.current = new window.google.maps.Polyline({
      map,
      path: [],
      strokeColor: "#ffffff",
      strokeOpacity: 1,
      strokeWeight: 2,
      clickable: false,
    });

    const clickL = map.addListener("click", (e) => {
      measurePathRef.current.push(e.latLng);
      measureLineRef.current.setPath(measurePathRef.current);
      updateLiveMeasure(e.latLng);
    });

    const rightL = map.addListener("rightclick", () => finishMeasure());
    const dblL = map.addListener("dblclick", () => finishMeasure());

    measureListenersRef.current = [clickL, rightL, dblL];
  };

    const startAreaMeasure = () => {
    clearExportInteraction();
    clearMeasure();
    const map = mapRef.current;
    if (!map || !window.google) return;

    measureModeRef.current = "area";
    setMeasureMode("area");

    measurePolyRef.current = new window.google.maps.Polygon({
      map,
      paths: [],
      strokeColor: "#ffffff",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#ffffff",
      fillOpacity: 0.08,
      clickable: false,
    });

    const clickL = map.addListener("click", (e) => {
      measurePathRef.current.push(e.latLng);
      measurePolyRef.current.setPath(measurePathRef.current);
      updateLiveMeasure(e.latLng);
    });

    const rightL = map.addListener("rightclick", () => finishMeasure());
    const dblL = map.addListener("dblclick", () => finishMeasure());

    measureListenersRef.current = [clickL, rightL, dblL];
  };

  function clearExportListeners() {
    const googleMaps = window.google?.maps;
    if (!googleMaps) return;

    (exportListenersRef.current || []).forEach((listener) => {
      try {
        googleMaps.event.removeListener(listener);
      } catch {
        // ignore
      }
    });

    exportListenersRef.current = [];
  }

  function clearExportFenceVisual() {
    try {
      exportFenceRef.current?.setMap?.(null);
    } catch {
      // ignore
    }

    exportFenceRef.current = null;
    exportPathRef.current = [];
    exportGeometryRef.current = null;
    setExportHasFence(false);
  }

  function resetExportDrawingState({ keepPanel = true } = {}) {
    clearExportListeners();
    clearExportFenceVisual();

    exportModeRef.current = null;
    setExportMode(null);
    setExportDialogOpen(false);
    setExportSummary(null);
    setExportWarning("");
    setExportCountSummary(null);
    setExportLargeConfirmArmed(false);

    if (!keepPanel) {
      setExportPanelOpen(false);
    }

    try {
      mapRef.current?.setOptions({ draggableCursor: null });
    } catch {
      // ignore
    }
  }

  function clearExportInteraction() {
    resetExportDrawingState({ keepPanel: false });
  }

  function beginExportPanel() {
    clearMeasure();
    setNoteAddMode(false);
    resetExportDrawingState({ keepPanel: true });
    setExportPanelOpen(true);
  }

  function toggleExportPanel() {
    const isOpen =
      exportPanelOpen || !!exportMode || exportHasFence || exportDialogOpen;

    if (isOpen) {
      clearExportInteraction();
      return;
    }

    beginExportPanel();
  }

  function startRectangleExportFence() {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    clearMeasure();
    setNoteAddMode(false);
    resetExportDrawingState({ keepPanel: true });
    setExportPanelOpen(true);

    exportModeRef.current = "rectangle";
    setExportMode("rectangle");

    try {
      map.setOptions({ draggableCursor: "crosshair" });
    } catch {
      // ignore
    }

    let firstCorner = null;

    const clickL = map.addListener("click", (e) => {
      if (!e?.latLng) return;

      if (!firstCorner) {
        firstCorner = e.latLng;
        setExportWarning("Rectangle started — click the opposite corner.");
        return;
      }

      const bounds = new window.google.maps.LatLngBounds(firstCorner, e.latLng);
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      exportFenceRef.current = new window.google.maps.Rectangle({
        map,
        bounds,
        strokeColor: "#111111",
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: "#111111",
        fillOpacity: 0.08,
        clickable: false,
        editable: false,
      });

      exportGeometryRef.current = {
        geometry: `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`,
        geometryType: "esriGeometryEnvelope",
        spatialRel: "esriSpatialRelIntersects",
        inSR: "4326",
      };

      setExportHasFence(true);
      setExportWarning("");
      clearExportListeners();

      exportModeRef.current = null;
      setExportMode(null);

      try {
        map.setOptions({ draggableCursor: null });
      } catch {
        // ignore
      }
    });

    const rightL = map.addListener("rightclick", () => {
      resetExportDrawingState({ keepPanel: true });
    });

    exportListenersRef.current = [clickL, rightL];
  }

  function finishPolygonExportFence() {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    const path = exportPathRef.current || [];
    if (path.length < 3) {
      setExportWarning("Polygon fence needs at least 3 points.");
      return;
    }

    const ring = path.map((p) => [p.lng(), p.lat()]);
    ring.push([path[0].lng(), path[0].lat()]);

    exportGeometryRef.current = {
      geometry: JSON.stringify({
        rings: [ring],
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryPolygon",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
    };

    setExportHasFence(true);
    setExportWarning("");
    clearExportListeners();

    exportModeRef.current = null;
    setExportMode(null);

    try {
      map.setOptions({ draggableCursor: null });
    } catch {
      // ignore
    }
  }

  function startPolygonExportFence() {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    clearMeasure();
    setNoteAddMode(false);
    resetExportDrawingState({ keepPanel: true });
    setExportPanelOpen(true);

    exportModeRef.current = "polygon";
    setExportMode("polygon");

    exportFenceRef.current = new window.google.maps.Polygon({
      map,
      paths: [],
      strokeColor: "#111111",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#111111",
      fillOpacity: 0.08,
      clickable: false,
      editable: false,
    });

    try {
      map.setOptions({ draggableCursor: "crosshair" });
    } catch {
      // ignore
    }

    const clickL = map.addListener("click", (e) => {
      if (!e?.latLng) return;
      exportPathRef.current.push(e.latLng);
      exportFenceRef.current?.setPath(exportPathRef.current);
      setExportWarning(
        "Polygon drawing — click more points, then right-click or double-click to finish."
      );
    });

    const rightL = map.addListener("rightclick", () => {
      finishPolygonExportFence();
    });

    const dblL = map.addListener("dblclick", () => {
      finishPolygonExportFence();
    });

    exportListenersRef.current = [clickL, rightL, dblL];
  }

  const LARGE_EXPORT_FEATURE_THRESHOLD = 5000;
  const EXPORT_PAGE_SIZE = 1000;

  function isGeographicProjectionCode(code = "") {
    return ["EPSG:7844", "EPSG:4283", "EPSG:4203", "EPSG:4326", "CIG92", "CKIG92"].includes(code);
  }

  function formatExportNumber(value, projectionCode, kind = "xy") {
    const num = Number(value);
    if (!Number.isFinite(num)) return "";

    if (kind === "z") return num.toFixed(3);
    return isGeographicProjectionCode(projectionCode) ? num.toFixed(8) : num.toFixed(3);
  }

  function sanitizeDxfLayerName(name = "Layer") {
    const cleaned = String(name || "Layer")
      .replace(/[<>\/\\":;?*|=,+\[\]\(\)']/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    return (cleaned || "Layer").slice(0, 50);
  }

function hexToDxfTrueColor(hex = "") {
  const raw = String(hex || "").trim();
  const normal = raw.startsWith("#") ? raw.slice(1) : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(normal)) return null;

  const r = parseInt(normal.slice(0, 2), 16);
  const g = parseInt(normal.slice(2, 4), 16);
  const b = parseInt(normal.slice(4, 6), 16);

  if (![r, g, b].every(Number.isFinite)) return null;

  return (r << 16) + (g << 8) + b;
}

function getPointLayerDxfTrueColor(layer) {
  const sym = layer?.data?.symbol || {};
  const hex = sym.fillColor || sym.strokeColor || "#ffffff";
  return hexToDxfTrueColor(hex);
}

function sanitizeDxfText(text = "") {
  return String(text || "")
    .replace(/\r?\n/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 240);
}

  function getLayerExportName(layer) {
    return sanitizeDxfLayerName(
      layer?.data?.outputLayerName || layer?.name || layer?.id || "Layer"
    );
  }

  function buildSafeTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    return [
      d.getFullYear(),
      pad(d.getMonth() + 1),
      pad(d.getDate()),
    ].join("-") + "_" + [
      pad(d.getHours()),
      pad(d.getMinutes()),
      pad(d.getSeconds()),
    ].join("-");
  }

  function buildExportFilename(format, projectionCode) {
    const ext = format === "csv" ? "csv" : "dxf";
    return `PWS_Maps_Export_${projectionCode}_${ext}_${buildSafeTimestamp()}.${ext}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function fetchArcgisCountByFence(url, fence, where = "1=1") {
    const params = new URLSearchParams({
      where,
      returnCountOnly: "true",
      f: "json",
      geometry: fence.geometry,
      geometryType: fence.geometryType,
      spatialRel: fence.spatialRel || "esriSpatialRelIntersects",
      inSR: fence.inSR || "4326",
      t: Date.now().toString(),
    });

    const res = await fetch(`${url}?${params.toString()}`);
    const json = await res.json();

    if (json?.error) throw new Error(json.error.message || "ArcGIS count error");
    return Number(json?.count || 0);
  }

  async function fetchArcgisGeojsonByFence(url, fence, where = "1=1", pageSize = EXPORT_PAGE_SIZE) {
    const allFeatures = [];
    let offset = 0;
    let safety = 0;

    while (safety < 50) {
      const params = new URLSearchParams({
        where,
        outFields: "*",
        f: "geojson",
        outSR: "4326",
        geometry: fence.geometry,
        geometryType: fence.geometryType,
        spatialRel: fence.spatialRel || "esriSpatialRelIntersects",
        inSR: fence.inSR || "4326",
        returnGeometry: "true",
        returnZ: "true",
        resultOffset: String(offset),
        resultRecordCount: String(pageSize),
        t: Date.now().toString(),
      });

      const res = await fetch(`${url}?${params.toString()}`);
      const json = await res.json();

      if (json?.error) throw new Error(json.error.message || "ArcGIS query error");

      const features = json?.features || [];
      allFeatures.push(...features);

      const exceeded = !!json?.exceededTransferLimit;
      if (!features.length || (!exceeded && features.length < pageSize)) {
        break;
      }

      offset += features.length;
      safety += 1;
    }

    return { type: "FeatureCollection", features: allFeatures };
  }

  function applyLayerExportFilter(featureCollection, layer) {
    const filterFn = layer?.data?.filterFn;
    if (typeof filterFn !== "function") return featureCollection;

    return {
      ...featureCollection,
      features: (featureCollection?.features || []).filter((feature) => {
        try {
          return !!filterFn(feature);
        } catch {
          return true;
        }
      }),
    };
  }

  function getLineCoordinateSets(geometry) {
    if (!geometry) return [];
    if (geometry.type === "LineString") return [geometry.coordinates || []];
    if (geometry.type === "MultiLineString") return geometry.coordinates || [];
    return [];
  }

  function getPolygonRingSets(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates || [];
    if (geometry.type === "MultiPolygon") {
      return (geometry.coordinates || []).flatMap((poly) => poly || []);
    }
    return [];
  }

  function getPointCoordinateSets(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Point") return [geometry.coordinates || []];
    if (geometry.type === "MultiPoint") return geometry.coordinates || [];
    return [];
  }

  function getLineLabelCoord(coords = []) {
    if (!coords.length) return null;
    return coords[Math.floor(coords.length / 2)] || coords[0] || null;
  }

  function getPolygonLabelCoord(ring = []) {
    if (!ring.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const coord of ring) {
      const x = Number(coord?.[0]);
      const y = Number(coord?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function getFirstNumericProp(props = {}, keys = []) {
    for (const key of keys) {
      const raw = props?.[key];
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  function getExpectedMga2020ZoneForProjection(projectionCode) {
    const map = {
      "EPSG:7849": 49,
      "EPSG:7850": 50,
      "EPSG:7851": 51,
      "EPSG:7852": 52,
    };
    return map[projectionCode] ?? null;
  }

function getPreferredPointXY(coord, props, projectionCode) {
  const id =
    props?.geodetic_point_pid ||
    props?.reference_mark_pid ||
    props?.point_number ||
    props?.rm_point_number ||
    "";

  const lng = Number(coord?.[0]);
  const lat = Number(coord?.[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const reprojectFromGeometry = (targetCode, source) => {
    const [x, y] = projectCoords(lng, lat, "EPSG:4326", targetCode);

    console.log(`EXPORT DEBUG ${source}`, {
      projectionCode: targetCode,
      id,
      lng,
      lat,
      x,
      y,
    });

    return { x, y, source };
  };

  // 1) Only trust EXPLICIT PCG2020 fields for PCG2020
  if (projectionCode === "PCG2020") {
    const e = getFirstNumericProp(props, ["pcg2020_easting"]);
    const n = getFirstNumericProp(props, ["pcg2020_northing"]);

    if (Number.isFinite(e) && Number.isFinite(n)) {
      console.log("EXPORT DEBUG native-pcg2020", {
        projectionCode,
        id,
        x: e,
        y: n,
        pcg2020_easting: props?.pcg2020_easting,
        pcg2020_northing: props?.pcg2020_northing,
      });

      return { x: e, y: n, source: "native-pcg2020" };
    }

    return reprojectFromGeometry("PCG2020", "reprojected-to-pcg2020");
  }

  // 2) Only trust EXPLICIT PCG94 fields for PCG94
  if (projectionCode === "PCG94") {
    const e = getFirstNumericProp(props, [
      "pcg94_easting",
      "pcg1994_easting",
      "project_grid_94_easting",
    ]);
    const n = getFirstNumericProp(props, [
      "pcg94_northing",
      "pcg1994_northing",
      "project_grid_94_northing",
    ]);

    if (Number.isFinite(e) && Number.isFinite(n)) {
      console.log("EXPORT DEBUG native-pcg94", {
        projectionCode,
        id,
        x: e,
        y: n,
        pcg94_easting: props?.pcg94_easting,
        pcg94_northing: props?.pcg94_northing,
      });

      return { x: e, y: n, source: "native-pcg94" };
    }

    return reprojectFromGeometry("PCG94", "reprojected-to-pcg94");
  }

  // 3) Native MGA2020 zone fields for MGA2020 exports
  const expectedZone = getExpectedMga2020ZoneForProjection(projectionCode);
  if (expectedZone !== null) {
    const zone = getFirstNumericProp(props, ["mga2020_zone", "zone"]);
    const e = getFirstNumericProp(props, ["mga2020_easting", "easting"]);
    const n = getFirstNumericProp(props, ["mga2020_northing", "northing"]);

    if (
      Number.isFinite(zone) &&
      Number.isFinite(e) &&
      Number.isFinite(n) &&
      Number(zone) === expectedZone
    ) {
      console.log("EXPORT DEBUG native-mga2020", {
        projectionCode,
        id,
        x: e,
        y: n,
        mga2020_zone: props?.mga2020_zone,
        mga2020_easting: props?.mga2020_easting,
        mga2020_northing: props?.mga2020_northing,
      });

      return { x: e, y: n, source: "native-mga2020" };
    }
  }

  // 4) Everything else: reproject from geometry
  return reprojectFromGeometry(projectionCode, "reprojected-geometry");
}
  function collectCsvRowsFromCollections(collections, projectionCode) {
    const rows = [];
    const preferredOrder = [];
    const attrKeySet = new Set();

    for (const { layer, featureCollection } of collections) {
      (layer?.data?.exportFieldOrder || []).forEach((key) => {
        if (!preferredOrder.includes(key)) preferredOrder.push(key);
      });

      (featureCollection?.features || []).forEach((feature, featureIndex) => {
        const props = feature?.properties || {};
        const baseId = getFeaturePointId(
          props,
          layer,
          `${layer?.id || "feature"}_${featureIndex + 1}`
        );

        const pointSets = getPointCoordinateSets(feature?.geometry);
pointSets.forEach((coord, pointIndex) => {
  const preferredXY = getPreferredPointXY(coord, props, projectionCode);
  if (!preferredXY) return;

  const { x, y } = preferredXY;

  const geomZ = Number(coord?.[2]);
  const attrZ = getFeatureZValue(props, layer);
  const zValue = Number.isFinite(geomZ) ? geomZ : attrZ;

          Object.keys(props).forEach((key) => attrKeySet.add(key));

          rows.push({
            feature_id: pointSets.length > 1 ? `${baseId}_${pointIndex + 1}` : baseId,
            x: formatExportNumber(x, projectionCode, "xy"),
            y: formatExportNumber(y, projectionCode, "xy"),
            z:
              zValue !== "" && zValue !== null && zValue !== undefined
                ? formatExportNumber(zValue, projectionCode, "z")
                : "",
            layer_name: layer?.name || layer?.id || "Layer",
            attributes: props,
          });
        });
      });
    }

    const orderedAttrKeys = [
      ...preferredOrder.filter((key) => attrKeySet.has(key)),
      ...Array.from(attrKeySet)
        .filter((key) => !preferredOrder.includes(key))
        .sort((a, b) => a.localeCompare(b)),
    ];

    return { rows, orderedAttrKeys };
  }

  function buildCombinedPointCsv(collections, projectionCode) {
    const { rows, orderedAttrKeys } = collectCsvRowsFromCollections(collections, projectionCode);

    if (!rows.length) {
      throw new Error("No point features found inside the fence for CSV export.");
    }

    const header = ["feature_id", "x", "y", "z", "layer_name", ...orderedAttrKeys];

    const lines = [
      header.map(csvEscape).join(","),
      ...rows.map((row) =>
        [
          row.feature_id,
          row.x,
          row.y,
          row.z,
          row.layer_name,
          ...orderedAttrKeys.map((key) => row.attributes?.[key] ?? ""),
        ]
          .map(csvEscape)
          .join(",")
      ),
    ];

    return lines.join("\r\n");
  }

  function dxfPair(code, value) {
    return `${code}\n${value}\n`;
  }

  function buildDxfLayerTable(layerNames) {
    const unique = Array.from(new Set(layerNames));
    let out = "";
    out += dxfPair(0, "SECTION");
    out += dxfPair(2, "TABLES");
    out += dxfPair(0, "TABLE");
    out += dxfPair(2, "LAYER");
    out += dxfPair(70, unique.length);

    unique.forEach((layerName) => {
      out += dxfPair(0, "LAYER");
      out += dxfPair(2, layerName);
      out += dxfPair(70, 0);
      out += dxfPair(62, 7);
      out += dxfPair(6, "CONTINUOUS");
    });

    out += dxfPair(0, "ENDTAB");
    out += dxfPair(0, "ENDSEC");
    return out;
  }

  function buildDxfPointEntity(layerName, x, y, z = 0, trueColor = null) {
    let out = "";
    out += dxfPair(0, "POINT");
    out += dxfPair(8, layerName);

    if (Number.isFinite(trueColor)) {
      out += dxfPair(420, trueColor);
    }

    out += dxfPair(10, x);
    out += dxfPair(20, y);
    out += dxfPair(30, z);
    return out;
  }

  function buildDxfTextEntity(layerName, x, y, text, height, z = 0, trueColor = null) {
    const safe = sanitizeDxfText(text);
    if (!safe) return "";

    let out = "";
    out += dxfPair(0, "TEXT");
    out += dxfPair(8, layerName);

    if (Number.isFinite(trueColor)) {
      out += dxfPair(420, trueColor);
    }

    out += dxfPair(10, x);
    out += dxfPair(20, y);
    out += dxfPair(30, z);
    out += dxfPair(40, height);
    out += dxfPair(1, safe);
    out += dxfPair(7, "STANDARD");
    return out;
  }

  function buildDxfLwPolylineEntity(layerName, points, closed = false) {
    if (!Array.isArray(points) || points.length < 2) return "";

    let out = "";
    out += dxfPair(0, "LWPOLYLINE");
    out += dxfPair(8, layerName);
    out += dxfPair(90, points.length);
    out += dxfPair(70, closed ? 1 : 0);

    points.forEach((pt) => {
      out += dxfPair(10, pt.x);
      out += dxfPair(20, pt.y);
    });

    return out;
  }

  function buildDxfFromCollections(collections, projectionCode) {
    const layerNames = [];
    let entities = "";

    const textHeight = isGeographicProjectionCode(projectionCode) ? 0.00015 : 1.5;

    for (const { layer, featureCollection } of collections) {
      const layerName = getLayerExportName(layer);
      layerNames.push(layerName);

      (featureCollection?.features || []).forEach((feature) => {
        const props = feature?.properties || {};
        const geometry = feature?.geometry;
        const labelText = getFeatureLabelText(props, layer);

const pointSets = getPointCoordinateSets(geometry);
if (pointSets.length) {
  const pointTrueColor = getPointLayerDxfTrueColor(layer);

  pointSets.forEach((coord) => {
    const preferredXY = getPreferredPointXY(coord, props, projectionCode);
    if (!preferredXY) return;

    const { x, y } = preferredXY;

    const geomZ = Number(coord?.[2]);
    const attrZ = getFeatureZValue(props, layer);
    const zValue =
      Number.isFinite(geomZ)
        ? geomZ
        : Number.isFinite(Number(attrZ))
        ? Number(attrZ)
        : 0;

    entities += buildDxfPointEntity(layerName, x, y, zValue, pointTrueColor);

    if (labelText) {
      entities += buildDxfTextEntity(
        layerName,
        x,
        y,
        labelText,
        textHeight,
        zValue,
        pointTrueColor
      );
    }
  });
  return;
}

        const lineSets = getLineCoordinateSets(geometry);
        if (lineSets.length) {
          lineSets.forEach((coords) => {
            const pts = coords
              .map((coord) => {
                const lng = Number(coord?.[0]);
                const lat = Number(coord?.[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                const [x, y] = projectCoords(lng, lat, "EPSG:4326", projectionCode);
                return { x, y };
              })
              .filter(Boolean);

            if (pts.length >= 2) {
              entities += buildDxfLwPolylineEntity(layerName, pts, false);
            }
          });

          if (labelText && lineSets[0]?.length) {
            const anchor = getLineLabelCoord(lineSets[0]);
            if (anchor) {
              const [x, y] = projectCoords(anchor[0], anchor[1], "EPSG:4326", projectionCode);
              entities += buildDxfTextEntity(layerName, x, y, labelText, textHeight);
            }
          }
          return;
        }

        const ringSets = getPolygonRingSets(geometry);
        if (ringSets.length) {
          ringSets.forEach((ring) => {
            const pts = ring
              .map((coord) => {
                const lng = Number(coord?.[0]);
                const lat = Number(coord?.[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                const [x, y] = projectCoords(lng, lat, "EPSG:4326", projectionCode);
                return { x, y };
              })
              .filter(Boolean);

            if (pts.length >= 3) {
              const first = pts[0];
              const last = pts[pts.length - 1];
              const alreadyClosed = first.x === last.x && first.y === last.y;
              const finalPts = alreadyClosed ? pts.slice(0, -1) : pts;
              entities += buildDxfLwPolylineEntity(layerName, finalPts, true);
            }
          });

          if (labelText && ringSets[0]?.length) {
            const anchor = getPolygonLabelCoord(ringSets[0]);
            if (anchor) {
              const [x, y] = projectCoords(anchor[0], anchor[1], "EPSG:4326", projectionCode);
              entities += buildDxfTextEntity(layerName, x, y, labelText, textHeight);
            }
          }
        }
      });
    }

    let out = "";
    out += dxfPair(0, "SECTION");
    out += dxfPair(2, "HEADER");
    out += dxfPair(0, "ENDSEC");
    out += buildDxfLayerTable(layerNames);
    out += dxfPair(0, "SECTION");
    out += dxfPair(2, "ENTITIES");
    out += entities;
    out += dxfPair(0, "ENDSEC");
    out += dxfPair(0, "EOF");

    return out;
  }

  async function executeExport() {
    console.log("EXPORT DEBUG selected projection", exportProjection);
    if (!exportGeometryRef.current) {
      setExportWarning("Draw a fence first.");
      return;
    }

    const selectedLayers =
      exportFormat === "csv"
        ? visibleExportableLayers.filter(
            (layer) =>
              layer.type === "point" &&
              (layer.data?.exportFormats || []).includes("csv")
          )
        : visibleExportableLayers.filter((layer) =>
            (layer.data?.exportFormats || []).includes("dxf")
          );

    if (!selectedLayers.length) {
      setExportWarning(
        exportFormat === "csv"
          ? "CSV export currently only supports visible point layers."
          : "Turn on at least one visible exportable layer first."
      );
      return;
    }

    setExportBusy(true);

    try {
      const countRows = await Promise.all(
        selectedLayers.map(async (layer) => {
          try {
            const count = await fetchArcgisCountByFence(
              layer.data.url,
              exportGeometryRef.current,
              layer.data?.where || "1=1"
            );
            return { layer, count };
          } catch {
            return { layer, count: null };
          }
        })
      );

      const totalFeatures = countRows.reduce(
        (sum, row) => sum + (Number.isFinite(row.count) ? row.count : 0),
        0
      );

      setExportCountSummary({
        totalFeatures,
        byLayer: countRows.map((row) => ({
          layerName: row.layer.name,
          count: row.count,
        })),
      });

      if (
        totalFeatures > LARGE_EXPORT_FEATURE_THRESHOLD &&
        !exportLargeConfirmArmed
      ) {
        setExportLargeConfirmArmed(true);
        setExportWarning(
          `Large export warning: about ${totalFeatures.toLocaleString()} features across ${selectedLayers.length} visible layer${
            selectedLayers.length === 1 ? "" : "s"
          }. Click Export again to continue.`
        );
        return;
      }

      const collections = await Promise.all(
        selectedLayers.map(async (layer) => {
          const raw = await fetchArcgisGeojsonByFence(
            layer.data.url,
            exportGeometryRef.current,
            layer.data?.where || "1=1",
            Math.min(EXPORT_PAGE_SIZE, layer.data?.maxFeatures || EXPORT_PAGE_SIZE)
          );

          return {
            layer,
            featureCollection: applyLayerExportFilter(raw, layer),
          };
        })
      );

      const filename = buildExportFilename(exportFormat, exportProjection);

      if (exportFormat === "csv") {
        const csvText = buildCombinedPointCsv(collections, exportProjection);
        downloadBlob(
          new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
          filename
        );
      } else {
        const dxfText = buildDxfFromCollections(collections, exportProjection);
        downloadBlob(
          new Blob([dxfText], { type: "application/dxf;charset=utf-8;" }),
          filename
        );
      }

            setExportWarning(`Export complete: ${filename}`);
//    clearExportInteraction();
    } catch (e) {
      console.error("Export failed:", e);
      setExportWarning(`Export failed: ${e?.message || "unknown error"}`);
    } finally {
      setExportBusy(false);
    }
  }

  function openExportDialog() {
    if (!exportHasFence || !exportGeometryRef.current) {
      setExportCountSummary(null);
      setExportLargeConfirmArmed(false);
      setExportWarning("Draw a fence first.");
      return;
    }

    if (!visibleExportableLayers.length) {
      setExportWarning("Turn on at least one exportable layer first.");
      return;
    }

    const csvPointLayers = visibleExportableLayers.filter(
      (l) =>
        l.type === "point" &&
        (l.data?.exportFormats || []).includes("csv")
    );

    setExportSummary({
      totalVisibleLayers: visibleExportableLayers.length,
      totalCsvPointLayers: csvPointLayers.length,
      layerNames: visibleExportableLayers.map((l) => l.name),
    });

    setExportCountSummary(null);
    setExportLargeConfirmArmed(false);
    setExportWarning("");
    setExportDialogOpen(true);
  }

  async function handleExportDialogSubmit() {
    await executeExport();
  }

  // ---------- Inject geodetic + cadastre layers ----------
  useEffect(() => {
    setLayers((prev) => {
      const hasSSM = prev.some((l) => l.id === "ssm076");
      const hasBM = prev.some((l) => l.id === "bm076");
      const hasRM = prev.some((l) => l.id === "rm199");
      const hasCad = prev.some((l) => l.id === "cad001");
      const hasLGA = prev.some((l) => l.id === "lga233");
      const hasLocalities = prev.some((l) => l.id === "localities234");
      const hasZoning = prev.some((l) => l.id === "zoning070");
      const hasSewer = prev.some((l) => l.id === "sewer068");
      const hasSewerMh = prev.some((l) => l.id === "sewer026");
      const next = [...prev];

    if (!hasSSM)
  next.push({
    id: "ssm076",
    name: "SSMs (LGATE-076)",
    type: "point",
    visible: false,
    data: {
      url: LGATE_076_QUERY,
      where: "1=1",
      minZoom: MIN_GEODETIC_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      symbol: ssmTriangleSymbol,
      layerTag: "SSM",
      idFields: [
        "geodetic_point_pid",
        "point_number",
        "objectid",
        "OBJECTID",
        "fid",
      ],
      nameFields: ["geodetic_point_name", "point_number"],
      label: {
        minZoom: SHOW_LABELS_ZOOM,
        color: "#ffffff",
        fontSize: "10px",
        fontWeight: "700",
      },
      filterFn: (feature) => {
        const p = feature?.properties || {};
        const rv = String(p.render_value || "").toUpperCase();
        const pt = String(p.point_type || "").toUpperCase();
        const cls = String(p.class || "").toUpperCase();
        return (
          !isDestroyed(p) &&
          (
            rv.startsWith("S") ||
            pt.includes("SSM") ||
            cls.includes("SSM") ||
            cls.includes("STANDARD SURVEY")
          )
        );
      },
      popupBuilder: ({ name, props, lat, lng }) =>
        buildPopupHtmlExample({
          layerTag: "SSM",
          name,
          props: { ...props, lat, lng },
        }),
        exportable: true,
exportFormats: ["csv", "dxf"],
zFields: ["reduced_level", "reducedlevel", "height"],
dxfLabelFields: ["geodetic_point_name", "point_number"],
exportFieldOrder: [
  "geodetic_point_pid",
  "point_number",
  "geodetic_point_name",
  "vert_datum",
  "reduced_level",
  "mga2020_zone",
  "mga2020_easting",
  "mga2020_northing",
],
    },
  });

if (!hasBM)
  next.push({
    id: "bm076",
    name: "BMs (LGATE-076)",
    type: "point",
    visible: false,
    data: {
      url: LGATE_076_QUERY,
      where: "1=1",
      minZoom: MIN_GEODETIC_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      symbol: bmSquareSymbol,
      layerTag: "BM",
      idFields: [
        "geodetic_point_pid",
        "point_number",
        "objectid",
        "OBJECTID",
        "fid",
      ],
      nameFields: ["geodetic_point_name", "point_number"],
      label: {
        minZoom: SHOW_LABELS_ZOOM,
        color: "#ffffff",
        fontSize: "10px",
        fontWeight: "700",
      },
      filterFn: (feature) => {
        const p = feature?.properties || {};
        const rv = String(p.render_value || "").toUpperCase();
        const pt = String(p.point_type || "").toUpperCase();
        const cls = String(p.class || "").toUpperCase();
        return (
          !isDestroyed(p) &&
          (
            rv.startsWith("B") ||
            pt.includes("BM") ||
            pt.includes("BENCH") ||
            cls.includes("BM") ||
            cls.includes("BENCH")
          )
        );
      },
      popupBuilder: ({ name, props, lat, lng }) =>
        buildPopupHtmlExample({
          layerTag: "BM",
          name,
          props: { ...props, lat, lng },
        }),
        exportable: true,
exportFormats: ["csv", "dxf"],
zFields: ["reduced_level", "reducedlevel", "height"],
dxfLabelFields: ["geodetic_point_name", "point_number"],
exportFieldOrder: [
  "geodetic_point_pid",
  "point_number",
  "geodetic_point_name",
  "vert_datum",
  "reduced_level",
  "mga2020_zone",
  "mga2020_easting",
  "mga2020_northing",
],
    },
  });

if (!hasRM)
  next.push({
    id: "rm199",
    name: "RMs (LGATE-199)",
    type: "point",
    visible: false,
    data: {
      url: LGATE_199_QUERY,
      where: "latest_status NOT LIKE '%DESTROY%' AND latest_status NOT LIKE '%REMOVE%'",
      minZoom: MIN_GEODETIC_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      symbol: rmCrossSymbol,
      layerTag: "RM",
      idFields: [
        "reference_mark_pid",
        "rm_point_number",
        "objectid",
        "OBJECTID",
        "fid",
      ],
      nameFields: ["reference_mark_name", "geodetic_point_name", "rm_point_number"],
      label: {
        minZoom: SHOW_LABELS_ZOOM,
        color: "#ffffff",
        fontSize: "10px",
        fontWeight: "700",
      },
      filterFn: (feature) => !isDestroyed(feature?.properties || {}),
      popupBuilder: ({ name, props, lat, lng }) =>
        buildPopupHtmlExample({
          layerTag: "RM",
          name,
          props: { ...props, lat, lng },
        }),
        exportable: true,
exportFormats: ["csv", "dxf"],
zFields: ["reduced_level", "reducedlevel", "height"],
dxfLabelFields: ["reference_mark_name", "rm_point_number"],
exportFieldOrder: [
  "reference_mark_pid",
  "rm_point_number",
  "reference_mark_name",
  "latest_status",
  "reduced_level",
  "mga2020_zone",
  "mga2020_easting",
  "mga2020_northing",
],
    },
  });
  if (!hasSewerMh)
  next.push({
    id: "sewer026",
    name: "Sewer Manholes (WCORP-026)",
    type: "point",
    visible: false,
data: {
  url: WCORP_026_QUERY,
  where: "1=1",
  minZoom: MIN_CADASTRE_ZOOM,
  maxFeatures: MAX_FEATURES_PER_VIEW,
  symbol: {
    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
    fillColor: "#ff4da6",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 1.5,
    scale: 4.5,
  },
  layerTag: "SEWER MH",
  exportable: true,
  exportFormats: ["csv", "dxf"],
  idFields: ["pacid", "objectid", "OBJECTID", "fid"],
  nameFields: ["pacid"],
  zFields: ["toplev"],
  dxfLabelFields: ["pacid"],
  exportFieldOrder: ["pacid", "toplev", "objectid", "OBJECTID", "fid"],
  label: null,
  filterFn: (feature) => !isDestroyed(feature?.properties || {}),
  popupBuilder: ({ props }) => {
    const id = props?.pacid;
    const rl = props?.toplev;

    return `
      <div style="min-width:160px; font-family:Inter,sans-serif; font-size:13px;">
        <div style="font-weight:800; margin-bottom:6px;">Sewer Manhole</div>

        <div><b>ID:</b> ${id ?? "-"}</div>

        <div><b>Lid RL:</b> ${
          rl !== null && rl !== undefined && rl !== ""
            ? Number(rl).toFixed(3)
            : "-"
        }</div>
      </div>
    `;
  },
  cluster: false,
},
  });
           if (!hasCad)
        next.push({
          id: "cad001",
          name: "Cadastre (LGATE-001)",
          type: "polygon",
          visible: false,
          data: {
            url: LGATE_001_QUERY,
            where: "1=1",
            minZoom: MIN_CADASTRE_ZOOM,
            maxFeatures: MAX_CADASTRE_FEATURES_PER_VIEW,
            style: {
              clickable: false,
              strokeColor: "#ffffff",
              strokeWeight: 0.9,
              fillOpacity: 0.0,
            },
            labels: null,
            exportable: true,
exportFormats: ["dxf"],
dxfLabelFields: [],
outputLayerName: "Cadastre",
infoFields: [
  { key: "objectid", label: "OBJECTID" },
],
          },
        });
      if (!hasLGA)
        next.push({
          id: "lga233",
          name: "LGA Boundaries (LGATE-233)",
          type: "polygon",
          visible: false,
          data: {
            url: LGATE_233_QUERY,
            where: "1=1",
            minZoom: 0,
            maxFeatures: MAX_FEATURES_PER_VIEW,
            style: {
              clickable: false,
              strokeColor: "#2e7d32",
              strokeWeight: 1.5,
              fillColor: "#a5d6a7",
              fillOpacity: 0.25,
            },
            labels: {
              minZoom: 8,
              fields: ["name"],
              color: "#1b5e20",
              fontWeight: "600",
              fontSize: (zoom) => (zoom >= 12 ? "12px" : "10px"),
              repeatAtZoom: null,
            },
            exportable: true,
exportFormats: ["dxf"],
dxfLabelFields: ["name", "lga_name", "local_government_authority"],
outputLayerName: "Local_Authority",
infoFields: [
  { key: "name", label: "Local Government Authority" },
],
          },
        });
if (!hasLocalities)
  next.push({
    id: "localities234",
    name: "Localities (LGATE-234)",
    type: "polygon",
    visible: false,
    data: {
      url: LGATE_234_QUERY,
      where: "1=1",
      minZoom: 0,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      outputLayerName: "Localities",
      style: {
        clickable: false,
        strokeColor: "#1976d2",
        strokeWeight: 1.4,
        fillColor: "#90caf9",
        fillOpacity: 0.18,
      },
      labels: {
        minZoom: 10,
        fields: ["name"],
        color: "#0d47a1",
        fontWeight: "700",
        fontSize: (zoom) => (zoom >= 13 ? "12px" : "10px"),
        repeatAtZoom: null,
      },
      infoFields: [
        { key: "name", label: "Locality" },
        { key: "postcode", label: "Postcode" },
      ],
    },
  });
      if (!hasZoning)
        next.push({
          id: "zoning070",
          name: "R-Codes Zoning (DPLH-070)",
          type: "polygon",
          visible: false,
          data: {
            url: DPLH_070_QUERY,
            where: "1=1",
            minZoom: MIN_CADASTRE_ZOOM,
            maxFeatures: MAX_FEATURES_PER_VIEW,
            style: {
              clickable: false,
              strokeColor: "#c62828",
              strokeWeight: 1.2,
              fillColor: "#ef9a9a",
              fillOpacity: 0.22,
            },
            labels: {
              minZoom: 12,
              fields: ["zone_code", "zone", "r_code", "rcode", "coding", "code", "name", "label"],
              color: "#8b0000",
              fontWeight: "700",
              fontSize: (zoom) => (zoom >= 15 ? "12px" : "10px"),
              repeatAtZoom: 15,
              repeatOffset: { lat: 0.0035, lng: 0.0035 },
            },
            exportable: true,
exportFormats: ["dxf"],
dxfLabelFields: ["zone_code", "zone", "r_code", "rcode", "name", "label"],
outputLayerName: "Zoning",
infoFields: [
  { key: "rcode_no", label: "R Code Zoning" },
  { key: "scheme_nam", label: "Scheme Name" },
  { key: "scheme_no", label: "Scheme Number" },
],
          },
        });
        if (!hasSewer)
  next.push({
    id: "sewer068",
    name: "Sewer Gravity Pipes (WCORP-068)",
    type: "line",
    visible: false,
    data: {
      url: WCORP_068_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
       exportable: true,
exportFormats: ["dxf"],
dxfLabelFields: [],
outputLayerName: "Sewer_Gravity_Pipes",
style: (feature) => {
  const maintype = String(feature.getProperty("maintype") || "").toUpperCase();

  // Bright, bold pink styling
  if (maintype.includes("TREATED")) {
    return {
      clickable: false,
      strokeColor: "#ff2d95", // bright pink
      strokeWeight: 3,        // thicker
      strokeOpacity: 0.6,
    };
  }

  if (maintype.includes("TRANSFER")) {
    return {
      clickable: false,
      strokeColor: "#ff007f", // even stronger pink
      strokeWeight: 4,        // thickest for mains
      strokeOpacity: 0.6,
    };
  }

  return {
    clickable: false,
    strokeColor: "#ff4da6", // standard bright pink
    strokeWeight: 3,
    strokeOpacity: 0.6,
  };
},
    },
  });
      return next;
    });
  }, []);

  // Apply persisted layer visibility once layers exist
  const appliedPersistedLayersRef = useRef(false);
  useEffect(() => {
    if (appliedPersistedLayersRef.current) return;
    if (!layers?.length) return;

    const persisted = safeReadState() || {};
    const vis = persisted.layerVisibility;
    if (!vis || typeof vis !== "object") {
      appliedPersistedLayersRef.current = true;
      return;
    }

    setLayers((prev) =>
      prev.map((l) =>
        Object.prototype.hasOwnProperty.call(vis, l.id)
          ? { ...l, visible: !!vis[l.id] }
          : l
      )
    );

    appliedPersistedLayersRef.current = true;
  }, [layers]);

  // Persist layer visibility whenever it changes
  useEffect(() => {
    if (!layers?.length) return;
    const layerVisibility = {};
    layers.forEach((l) => (layerVisibility[l.id] = !!l.visible));
    safeWriteState({ layerVisibility });
  }, [layers]);

 // ---------- Shared point layer loader ----------
useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  if (!map || !googleMaps) return;
  if (!isAppVisible) return;

  const pointLayers = layers.filter((l) => l.type === "point");
  if (!pointLayers.length) return;

  const bounds = viewRef.current?.bounds || map.getBounds();
  const zoom = viewRef.current?.zoom ?? map.getZoom();

  const ensureStore = (layer) => {
    let store = pointLayersRef.current.get(layer.id);

    if (!store) {
      store = {
        markers: [],
        index: new Map(),
      };
      pointLayersRef.current.set(layer.id, store);
    }

    return store;
  };

  const clearLayer = (store) => {
    for (const marker of store.index.values()) {
      try {
        marker.setMap(null);
      } catch {
        // ignore
      }
    }
    store.index.clear();
    store.markers = [];
  };

const syncClusterer = () => {
  if (!clustererRef.current) {
    clustererRef.current = new MarkerClusterer({ map, markers: [] });
  }

  // Don’t re-cluster while a point popup is open
  if (mainInfoOpenRef.current) return;

  const visibleMarkers = [];
  pointLayers.forEach((layer) => {
    if (!layer.visible) return;
    if (layer.data?.cluster === false) return;
    const store = pointLayersRef.current.get(layer.id);
    if (!store) return;
    visibleMarkers.push(...store.markers);
  });

  clustererRef.current.clearMarkers();
  if (visibleMarkers.length) clustererRef.current.addMarkers(visibleMarkers);
};

  pointLayers.forEach((layer) => {
    const store = ensureStore(layer);

    if (!bounds || !layer.visible || (zoom ?? 0) < (layer.data?.minZoom ?? 0)) {
      clearLayer(store);
    }
  });

  const run = async () => {
    let totalVisible = 0;

    for (const layer of pointLayers) {
      const store = ensureStore(layer);

      if (!layer.visible) continue;
      if (!bounds) continue;

      if ((zoom ?? 0) < (layer.data?.minZoom ?? 0)) {
        continue;
      }

      const now = Date.now();
      if (now - (lastFetchRef.current[layer.id] || 0) < FETCH_THROTTLE_MS) {
        continue;
      }
      lastFetchRef.current[layer.id] = now;

      try {
        const geojson = await fetchArcgisGeojsonInView(
          layer.data.url,
          bounds,
          layer.data.where || "1=1"
        );

        let features = geojson.features || [];

        if (typeof layer.data?.filterFn === "function") {
          features = features.filter(layer.data.filterFn);
        }

        const maxFeatures = layer.data?.maxFeatures ?? MAX_FEATURES_PER_VIEW;
        if (features.length > maxFeatures) {
          console.warn(`${layer.name}: too many features in view, zoom in further.`);
          clearLayer(store);
          continue;
        }

        const nextIds = new Set();

        for (const feature of features) {
          const props = feature?.properties || {};
          const coords = feature?.geometry?.coordinates || [];
          const [lng, lat] = coords;

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          const fallbackId = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          const id = getFeaturePointId(props, layer, fallbackId);
          nextIds.add(id);

          const name = getFeaturePointName(props, layer.data?.nameFields || [], id);
          const showLabel = (zoom ?? 0) >= (layer.data?.label?.minZoom ?? 999);

          let marker = store.index.get(id);

          if (!marker) {
            marker = new googleMaps.Marker({
              position: { lat, lng },
              map,
              icon: layer.data?.symbol,
              title: name || layer.name,
              label: showLabel
                ? {
                    text: name || "",
                    color: layer.data?.label?.color || "#ffffff",
                    fontSize: layer.data?.label?.fontSize || "10px",
                    fontWeight: layer.data?.label?.fontWeight || "700",
                  }
                : null,
              optimized: true,
            });

   marker.addListener("click", () => {
  const html =
    typeof layer.data?.popupBuilder === "function"
      ? layer.data.popupBuilder({ name, props, lat, lng })
      : `<div data-pw-drag-handle="1" style="font-weight:800;">${name || layer.name}</div>`;

  openMainInfoWindow({
    html,
    marker,
    markerId: id,
    layerId: layer.id,
  });
});

            store.index.set(id, marker);
          } else {
            marker.setPosition({ lat, lng });
            marker.setIcon(layer.data?.symbol);
            marker.setTitle(name || layer.name);
            marker.setLabel(
              showLabel
                ? {
                    text: name || "",
                    color: layer.data?.label?.color || "#ffffff",
                    fontSize: layer.data?.label?.fontSize || "10px",
                    fontWeight: layer.data?.label?.fontWeight || "700",
                  }
                : null
            );
            if (!marker.getMap()) marker.setMap(map);
          }
        }

      for (const [id, marker] of store.index.entries()) {
  const markerKey = `${layer.id}::${id}`;
  const isActivePopupMarker =
    mainInfoOpenRef.current &&
    activeMainInfoKeyRef.current === markerKey;

  if (!nextIds.has(id) && !isActivePopupMarker) {
    marker.setMap(null);
    store.index.delete(id);
  }
}

        store.markers = Array.from(store.index.values());
        totalVisible += store.markers.length;
      } catch (err) {
        console.warn(`${layer.name} fetch failed:`, err);
        clearLayer(store);
      }
    }

    if (totalVisible === 0 && pointLayers.some((l) => l.visible && (zoom ?? 0) < (l.data?.minZoom ?? 0))) {
      setGeodeticNotice(`Zoom to ${MIN_GEODETIC_ZOOM}+ to see geodetic marks.`);
    } else {
      setGeodeticNotice("");
    }

    syncClusterer();
  };

  run();

const staleTimer = setInterval(() => {
  const anyVisible = pointLayers.some((l) => l.visible);
  if (!anyVisible) return;

  // Don’t refresh point layers while a point popup is open
  if (mainInfoOpenRef.current) return;

  setViewTick((t) => t + 1);
}, STALE_REFRESH_MS);

  return () => clearInterval(staleTimer);
}, [layers, viewTick, isAppVisible]);

    // ✅ Shared polygon layer loader (cadastre, LGA, zoning, future polygon layers)
  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;
    if (!isAppVisible) return;

    const polygonLayers = layers.filter((l) => l.type === "polygon");
    if (!polygonLayers.length) return;

    const bounds = viewRef.current?.bounds || map.getBounds();
    const zoom = viewRef.current?.zoom ?? map.getZoom();

    const ensureStore = (layer) => {
      let store = polygonLayersRef.current.get(layer.id);

      if (!store) {
        const polygons = new googleMaps.Data();
        polygons.setMap(map);
        polygons.setStyle(layer.data?.style || { clickable: false });

        store = {
          polygons,
          labels: [],
        };

        polygonLayersRef.current.set(layer.id, store);
      } else {
        store.polygons.setMap(map);
        store.polygons.setStyle(layer.data?.style || { clickable: false });
      }

      return store;
    };

    const clearLabels = (store) => {
      (store.labels || []).forEach((m) => {
        try {
          m.setMap(null);
        } catch {
          // ignore
        }
      });
      store.labels = [];
    };

    const clearLayer = (store) => {
      store.polygons.forEach((f) => store.polygons.remove(f));
      clearLabels(store);
    };

    polygonLayers.forEach((layer) => {
      const store = ensureStore(layer);

      if (!bounds || (zoom ?? 0) < (layer.data?.minZoom ?? 0) || !layer.visible) {
        clearLayer(store);
      }
    });

    const run = async () => {
      for (const layer of polygonLayers) {
        const store = ensureStore(layer);

        if (!layer.visible) continue;
        if (!bounds) continue;
        if ((zoom ?? 0) < (layer.data?.minZoom ?? 0)) continue;

        const throttleMs = CADASTRE_FETCH_THROTTLE_MS;

        const now = Date.now();
        if (now - (lastFetchRef.current[layer.id] || 0) < throttleMs) continue;
        lastFetchRef.current[layer.id] = now;

        try {
          const geojson = await fetchArcgisGeojsonInView(
            layer.data.url,
            bounds,
            layer.data.where || "1=1"
          );

          const maxFeatures = layer.data?.maxFeatures ?? MAX_FEATURES_PER_VIEW;
          if ((geojson.features?.length || 0) > maxFeatures) {
            console.warn(`${layer.name}: too many features in view, zoom in further.`);
            clearLayer(store);
            continue;
          }

          clearLayer(store);
          store.polygons.addGeoJson(geojson);

          const labelCfg = layer.data?.labels;
          if (!labelCfg) continue;
          if ((zoom ?? 0) < (labelCfg.minZoom ?? 999)) continue;

          const nextLabels = [];

          store.polygons.forEach((feature) => {
            const text = getPolygonLabelText(feature, labelCfg.fields || []);
            const center = getCentroidFromGoogleGeometry(feature.getGeometry(), googleMaps);
            if (!center || !text) return;

            nextLabels.push(
              buildInvisibleLabelMarker({
                googleMaps,
                map,
                position: center,
                text,
                color: labelCfg.color || "#111",
                fontWeight: labelCfg.fontWeight || "700",
                fontSize:
                  typeof labelCfg.fontSize === "function"
                    ? labelCfg.fontSize(zoom)
                    : labelCfg.fontSize || "10px",
              })
            );

            if (labelCfg.repeatAtZoom && (zoom ?? 0) >= labelCfg.repeatAtZoom) {
              const latOffset = labelCfg.repeatOffset?.lat ?? 0;
              const lngOffset = labelCfg.repeatOffset?.lng ?? 0;

              const repeats = [
                new googleMaps.LatLng(center.lat() + latOffset, center.lng()),
                new googleMaps.LatLng(center.lat() - latOffset, center.lng()),
                new googleMaps.LatLng(center.lat(), center.lng() + lngOffset),
                new googleMaps.LatLng(center.lat(), center.lng() - lngOffset),
              ];

              repeats.forEach((pos) => {
                nextLabels.push(
                  buildInvisibleLabelMarker({
                    googleMaps,
                    map,
                    position: pos,
                    text,
                    color: labelCfg.color || "#111",
                    fontWeight: labelCfg.fontWeight || "700",
                    fontSize:
                      typeof labelCfg.fontSize === "function"
                        ? labelCfg.fontSize(zoom)
                        : labelCfg.fontSize || "10px",
                  })
                );
              });
            }
          });

          store.labels = nextLabels;
        } catch (err) {
          console.warn(`${layer.name} fetch failed:`, err);
          clearLayer(store);
        }
      }
    };

    run();
  }, [layers, viewTick, isAppVisible]);
  
// ---------- Shared line layer loader ----------
useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  if (!map || !googleMaps) return;
  if (!isAppVisible) return;

  const lineLayers = layers.filter((l) => l.type === "line");
  if (!lineLayers.length) return;

  const bounds = viewRef.current?.bounds || map.getBounds();
  const zoom = viewRef.current?.zoom ?? map.getZoom();

  const ensureStore = (layer) => {
    let store = lineLayersRef.current.get(layer.id);

    if (!store) {
      const lines = new googleMaps.Data();
      lines.setMap(map);
      lines.setStyle(layer.data?.style || { clickable: false });

      store = { lines };
      lineLayersRef.current.set(layer.id, store);
    } else {
      store.lines.setMap(map);
      store.lines.setStyle(layer.data?.style || { clickable: false });
    }

    return store;
  };

  const clearLayer = (store) => {
    store.lines.forEach((f) => store.lines.remove(f));
  };

  lineLayers.forEach((layer) => {
    const store = ensureStore(layer);

    if (!bounds || !layer.visible || (zoom ?? 0) < (layer.data?.minZoom ?? 0)) {
      clearLayer(store);
    }
  });

  const run = async () => {
    for (const layer of lineLayers) {
      const store = ensureStore(layer);

      if (!layer.visible) continue;
      if (!bounds) continue;
      if ((zoom ?? 0) < (layer.data?.minZoom ?? 0)) continue;

      const now = Date.now();
      if (now - (lastFetchRef.current[layer.id] || 0) < CADASTRE_FETCH_THROTTLE_MS) {
        continue;
      }
      lastFetchRef.current[layer.id] = now;

      try {
        const geojson = await fetchArcgisGeojsonInView(
          layer.data.url,
          bounds,
          layer.data.where || "1=1"
        );

        const maxFeatures = layer.data?.maxFeatures ?? MAX_FEATURES_PER_VIEW;
        if ((geojson.features?.length || 0) > maxFeatures) {
          console.warn(`${layer.name}: too many features in view, zoom in further.`);
          clearLayer(store);
          continue;
        }

        clearLayer(store);
        store.lines.addGeoJson(geojson);
      } catch (err) {
        console.warn(`${layer.name} fetch failed:`, err);
        clearLayer(store);
      }
    }
  };

  run();
}, [layers, viewTick, isAppVisible]);

  const toggleLayer = (id) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  const cadLayer = useMemo(() => layers.find((l) => l.id === "cad001"), [layers]);
  const ssmLayer = useMemo(() => layers.find((l) => l.id === "ssm076"), [layers]);
  const bmLayer = useMemo(() => layers.find((l) => l.id === "bm076"), [layers]);
  const rmLayer = useMemo(() => layers.find((l) => l.id === "rm199"), [layers]);

  const geodeticAnyOn = !!(ssmLayer?.visible || bmLayer?.visible || rmLayer?.visible);

  const toggleGeodeticAll = () => {
    const next = !geodeticAnyOn;
    setLayers((prev) =>
      prev.map((l) =>
        ["ssm076", "bm076", "rm199"].includes(l.id) ? { ...l, visible: next } : l
      )
    );
  };

  const renderTabButton = (key, label) => (
    <button
      type="button"
      className={`maps-tab ${activeTab === key ? "active" : ""}`}
      onClick={() => setActiveTab(key)}
    >
      {label}
    </button>
  );

  const panelInputStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      boxSizing: "border-box",
    }),
    []
  );

 const leftPanelFontSize = useMemo(() => (isSmallScreen() ? 12 : 13), []);

// Step 3: stop tracking when Maps unmounts / page closes
useEffect(() => {
  return () => {
    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
  };
}, []);

// Stop tracking when app goes into background
useEffect(() => {
  if (!isAppVisible && locationWatchIdRef.current !== null) {
    navigator.geolocation.clearWatch(locationWatchIdRef.current);
    locationWatchIdRef.current = null;
  }
}, [isAppVisible]);

return (
    <div className="maps-fullscreen">
      <div className="maps-topbar" style={{ height: TOP_BAR_HEIGHT }}>
        <div className="maps-title-group">
          <span className="maps-title">Maps</span>
          <span className="maps-subtitle">
            Search jobs or any street address, zoom, and navigate
          </span>
        </div>
        <a href="/" className="maps-back-link">
          ← Back to Portal
        </a>

<button
  type="button"
  className="maps-header-menu-btn"
  onClick={toggleMapsDrawer}
  aria-label="Toggle maps menu"
  title="Toggle maps menu"
>
  {mapsDrawerOpen ? "☰" : "☰"}
</button>

      </div>

      <div
        className="maps-mapwrap"
        style={{
          height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
          position: "relative",
        }}
      >

<div ref={mapDivRef} className="maps-map" />

<div ref={toolsControlDivRef} className="maps-floating-tools">
 <button type="button" data-action="distance" title="Measure distance" onClick={startDistanceMeasure}>📏</button>
<button type="button" data-action="area" title="Measure area" onClick={startAreaMeasure}>📐</button>
<button type="button" data-action="location" title="My location" onClick={handleMyLocation}>📍</button>
  <button
    type="button"
    title="Historical imagery"
    onClick={() => {
      const map = mapRef.current;
      if (!map) return;
      const c = map.getCenter();
      const url = buildGoogleEarthUrl(c.lat(), c.lng(), map.getZoom());
      openExternalNav(url);
    }}
  >
    🕘
  </button>
  <button
    type="button"
    title="Street View"
    onClick={() => {
      const map = mapRef.current;
      if (!map) return;
      const sv = map.getStreetView();
      const c = map.getCenter();
      if (sv.getVisible()) sv.setVisible(false);
      else {
        sv.setPosition(c);
        sv.setPov({ heading: 0, pitch: 0 });
        sv.setVisible(true);
      }
    }}
  >
    👤
  </button>

<button
  type="button"
  title="Map information"
  data-action="info"
  onClick={toggleInfoMode}
  style={{
    background: infoMode ? "#000" : undefined,
    color: infoMode ? "#fff" : undefined,
  }}
>
  ℹ
</button>

  <button type="button" data-action="export" title="Export visible layers" onClick={toggleExportPanel}>⬇</button>

  {measureMode && (
    <button type="button" title="Finish measurement" onClick={finishMeasure}>✔</button>
  )}

  {hasMeasure && (
    <button type="button" title="Clear measurement" onClick={clearMeasure}>✖</button>
  )}
</div>

{isMobile && mapsDrawerOpen && (
  <button
    type="button"
    className="maps-mobile-drawer-backdrop"
    onClick={closeMapsDrawer}
    aria-label="Close maps menu"
  />
)}

      {exportPanelOpen && (
  <div
    style={{
      position: "absolute",
      top: isMobile ? 74 : 84,
      left: 12,
      zIndex: 14,
      width: isMobile ? "calc(100vw - 24px)" : 320,
      maxWidth: "calc(100vw - 24px)",

      // ✅ keep the popup fully usable on small screens
      maxHeight: isMobile ? "calc(100vh - 96px)" : "calc(100vh - 120px)",
      overflowY: "auto",
      overflowX: "hidden",
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",

      background: "rgba(255,255,255,0.98)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(0,0,0,0.12)",
      borderRadius: 16,
      boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
      padding: 12,
      paddingBottom: 18,
    }}
  >
           <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,

    // ✅ keep title + close button visible
    position: "sticky",
    top: -12,
    zIndex: 2,
    background: "rgba(255,255,255,0.98)",
    paddingTop: 2,
    paddingBottom: 8,
  }}
>
              <div style={{ fontWeight: 950, fontSize: 13 }}>Export visible layers</div>
              <button
                type="button"
                className="btn-pill"
                style={{ padding: "5px 10px", fontSize: 11 }}
                onClick={() => clearExportInteraction()}
              >
                Close
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 8,
              }}
            >
              <button
                type="button"
                className={`btn-pill ${exportMode === "rectangle" ? "primary" : ""}`}
                onClick={startRectangleExportFence}
              >
                Draw Rectangle
              </button>

              <button
                type="button"
                className={`btn-pill ${exportMode === "polygon" ? "primary" : ""}`}
                onClick={startPolygonExportFence}
              >
                Draw Polygon
              </button>

              <button
                type="button"
                className="btn-pill"
                onClick={() => resetExportDrawingState({ keepPanel: true })}
              >
                Clear Fence
              </button>

              <button
                type="button"
                className={`btn-pill ${exportHasFence ? "primary" : ""}`}
                onClick={openExportDialog}
                disabled={!exportHasFence}
                title={!exportHasFence ? "Draw a fence first" : "Continue to export options"}
              >
                Continue Export
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.04)",
                border: "1px solid rgba(0,0,0,0.08)",
                fontSize: 12,
                fontWeight: 800,
                color: "#222",
              }}
            >
              {exportHasFence
                ? "Fence ready — continue to export options."
                : exportMode === "rectangle"
                ? "Rectangle mode: click first corner, then click the opposite corner."
                : exportMode === "polygon"
                ? "Polygon mode: click points, then right-click or double-click to finish."
                : "Choose Draw Rectangle or Draw Polygon to start."}
            </div>

            {!!visibleExportableLayers.length && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#444", fontWeight: 800 }}>
                Visible exportable layers: {visibleExportableLayers.map((l) => l.name).join(", ")}
              </div>
            )}
          </div>
        )}

        {exportDialogOpen && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 15,
              background: "rgba(0,0,0,0.22)",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: isMobile ? "72px 12px 12px" : "88px 16px 16px",
            }}
          >
            <div
              style={{
                width: "min(560px, 100%)",
                background: "#fff",
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: "0 18px 36px rgba(0,0,0,0.22)",
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 950, fontSize: 15 }}>Export options</div>
                <button
                  type="button"
                  className="btn-pill"
                  style={{ padding: "5px 10px", fontSize: 11 }}
                  onClick={() => setExportDialogOpen(false)}
                >
                  Close
                </button>
              </div>

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#333",
                  marginBottom: 10,
                }}
              >
                Fence ready. {exportSummary?.totalVisibleLayers || 0} visible exportable layer
                {(exportSummary?.totalVisibleLayers || 0) === 1 ? "" : "s"} selected.
              </div>

              {!!exportSummary?.layerNames?.length && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    fontSize: 12,
                    color: "#222",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Visible layers</div>
                  <div>{exportSummary.layerNames.join(", ")}</div>
                </div>
              )}

              {exportCountSummary ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(25,118,210,0.08)",
                    border: "1px solid rgba(25,118,210,0.18)",
                    fontSize: 12,
                    color: "#123",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    Estimated features
                  </div>

                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    Total: {(exportCountSummary.totalFeatures || 0).toLocaleString()}
                  </div>

                  <div style={{ display: "grid", gap: 4 }}>
                    {(exportCountSummary.byLayer || []).map((row) => (
                      <div key={row.layerName}>
                        {row.layerName}:{" "}
                        {Number.isFinite(row.count)
                          ? row.count.toLocaleString()
                          : "count unavailable"}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 10,
                }}
              >
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>Format</span>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="maps-search-input"
                    style={{ ...panelInputStyle, marginTop: 0 }}
                  >
                    <option value="dxf">DXF</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>Projection</span>
                  <select
                    value={exportProjection}
                    onChange={(e) => setExportProjection(e.target.value)}
                    className="maps-search-input"
                    style={{ ...panelInputStyle, marginTop: 0 }}
                  >
                    {PROJECTION_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(25,118,210,0.08)",
                  border: "1px solid rgba(25,118,210,0.18)",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Projection</div>
                <div>{exportProjectionPreview}</div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Filename preview</div>
                <div style={{ wordBreak: "break-word" }}>{exportFilenamePreview}</div>
              </div>

              {exportFormat === "csv" && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(255,165,0,0.12)",
                    border: "1px solid rgba(255,165,0,0.25)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  CSV will only include visible point layers inside the fence.
                </div>
              )}

              {exportWarning ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(211,47,47,0.10)",
                    border: "1px solid rgba(211,47,47,0.18)",
                    color: "#8a1f1f",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  {exportWarning}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => setExportDialogOpen(false)}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="btn-pill primary"
                  disabled={exportBusy}
                  onClick={handleExportDialogSubmit}
                >
                  {exportBusy ? "Preparing…" : exportLargeConfirmArmed ? "Export Anyway" : "Export"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Left retractable panel */}
   {/* Retractable maps panel */}
<div
 className={`maps-rightpanel ${
  mapsDrawerOpen ? "mobile-open" : "mobile-closed"
}`}
>
          
          <div
  className="panel-content"
  style={{
    fontSize: leftPanelFontSize,
    paddingBottom: isMobile && mobileKeyboardOpen ? 260 : undefined,
  }}
>
            <div className="maps-tabs">
              {renderTabButton("layers", "Layers")}
              {renderTabButton("jobLayers", "Job Layers")}
              {renderTabButton("notes", "Notes")}
              {renderTabButton("legend", "Legend")}
            </div>

            {/* =========================
                TAB: JOB LAYERS (Portal)
               ========================= */}
            {activeTab === "jobLayers" && (
              <div className="panel-card" style={{ overflow: "hidden" }}>
                <div
                  className="panel-card-title"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span>Search</span>
                 <button
  type="button"
  className="btn-pill"
  style={{ padding: "6px 8px", fontSize: 11, flexShrink: 0 }}
  onClick={() => {
    fetchPortalJobs();

    // Clear address search box
    if (addressInputRef.current) {
      addressInputRef.current.value = "";
    }

    // Clear selected address card/state
    setSelectedAddress(null);

    // Remove address marker
    if (addressMarkerRef.current) {
      addressMarkerRef.current.setMap(null);
    }

    // Close address popup
    try {
      addressInfoWindowRef.current?.close();
    } catch {
      // ignore
    }

    // Clear job number search box
    setJobNumberQuery("");
    setJobPicked(false);
    setJobNumberActiveIndex(-1);

    // Clear selected portal job
    setPortalSelectedJobId(null);

    // Close job popup/hover
    try {
      infoWindowRef.current?.close();
      hoverInfoWindowRef.current?.close();
    } catch {
      // ignore
    }
  }}
  title="Refresh jobs from Supabase"
>
  Refresh
</button>
                </div>

                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    background: "rgba(255,255,255,0.98)",
                    backdropFilter: "blur(6px)",
                    paddingBottom: 10,
                    marginBottom: 10,
                    borderBottom: "1px solid rgba(0,0,0,0.10)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#111" }}>
                    Address search
                  </div>
                  <input
                    ref={addressInputRef}
                    type="text"
                    placeholder="Start typing an address…"
                    className="maps-search-input"
                    style={{ marginTop: 6, ...panelInputStyle }}
                    autoComplete="off"
                  />

                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#111",
                      marginTop: 10,
                    }}
                  >
                    Job number search
                  </div>

                  <input
  ref={jobNumberInputRef}
  type="text"
  value={jobNumberQuery}
                    onChange={(e) => {
                      setJobNumberQuery(e.target.value);
                      setJobPicked(false);
                    }}
                    placeholder="Type a job number…"
                    className="maps-search-input"
                    style={{ marginTop: 6, ...panelInputStyle }}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      const list = jobNumberSuggestions || [];
                      const open =
                        String(jobNumberQuery || "").trim() &&
                        !jobPicked &&
                        list.length > 0;

                      if (!open) return;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setJobNumberActiveIndex((i) =>
                          Math.min(i + 1, list.length - 1)
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setJobNumberActiveIndex((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const chosen =
                          jobNumberActiveIndex >= 0
                            ? list[jobNumberActiveIndex]
                            : list[0]; // ✅ if nothing highlighted, pick top result
                        if (!chosen) return;

                        handleSelectPortalJob(chosen);
                        setJobNumberQuery(String(chosen.job_number ?? ""));
                        setJobPicked(true);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setJobPicked(true); // hides dropdown but keeps text
                      }
                    }}
                    onFocus={() => {
  if (String(jobNumberQuery || "").trim()) setJobPicked(false);

  if (isMobile) {
  openMapsDrawer()
  setMobileKeyboardOpen(true);
}

  setTimeout(() => {
    try {
      jobNumberInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } catch {
      // ignore
    }
  }, 250);
}}
onBlur={() => {
  if (isMobile) {
    setTimeout(() => {
      setMobileKeyboardOpen(false);
    }, 150);
  }
}}
                  />

                  {/* Dropdown hides after selection, but job number stays */}
                  {String(jobNumberQuery || "").trim() &&
                    !jobPicked &&
                    jobNumberSuggestions.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          borderRadius: 10,
                          overflow: "hidden",
                          border: "1px solid rgba(0,0,0,0.12)",
                          boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
                          background: "#fff",
                          maxHeight: isSmallScreen() ? 180 : 220,
                          overflowY: "auto",
                        }}
                      >
                        {jobNumberSuggestions.map((job, idx) => (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => {
                              // if All Jobs is OFF -> only this job will show
                              // if All Jobs is ON -> in-view jobs show, and this job goes green
                              handleSelectPortalJob(job);
                              setJobNumberQuery(String(job.job_number ?? ""));
                              setJobPicked(true);
                            }}
                            style={{
                              width: "100%",
                              border: "none",
                              background: jobNumberActiveIndex === idx ? "rgba(0,0,0,0.06)" : "#fff",
                              padding: "10px 10px",
                              cursor: "pointer",
                              textAlign: "left",
                              borderBottom: "1px solid rgba(0,0,0,0.06)",
                            }}
                            onMouseEnter={() => setJobNumberActiveIndex(idx)}
                            onMouseLeave={() => setJobNumberActiveIndex(-1)}
                          >
                            <div style={{ fontWeight: 900, fontSize: 13, color: "#111" }}>
                              Job #{job.job_number}
                            </div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 12,
                                color: "#444",
                                marginTop: 2,
                              }}
                            >
                              {(job.client_name || "—") + " · " + (job.full_address || "—")}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                <div className="panel-card-title" style={{ marginBottom: 6 }}>
                  Portal job visibility
                </div>

                {/* ✅ Behaviour: when unticked, ONLY the searched/selected job shows */}
                <label
                  className="maps-mini-check"
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={showAllPortalJobs}
                    onChange={() => setShowAllPortalJobs((v) => !v)}
                  />
                  <span style={{ fontWeight: 800 }}>All Jobs</span>
                </label>

                {!showAllPortalJobs && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#444", fontWeight: 700 }}>
                    All Jobs is off — only the selected job will display (green pin).
                  </div>
                )}

                {portalJobsLoading && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                    Loading portal jobs…
                  </div>
                )}
                {portalJobsError && (
                  <div style={{ fontSize: 12, color: "#b00020", marginTop: 8 }}>
                    {portalJobsError}
                  </div>
                )}

                <div className="maps-layer-hint" style={{ marginTop: 10 }}>
                  Tip: Job search is <b>job number only</b>. Address search uses Google autofill.
                </div>
              </div>
            )}

            {/* =========================
                TAB: LAYERS
               ========================= */}
            {activeTab === "layers" && (
              <div className="panel-card">
                <div className="panel-card-title">Layers</div>

                {geodeticNotice && <div className="maps-notice">{geodeticNotice}</div>}

                <div className="maps-layer-section">
                  <div className="maps-layer-section-title">Cadastre</div>
                  <div className="layers-list">
                    {cadLayer && (
                      <div className="layer-row layer-row-compact">
                        <label className="layer-left">
                          <input
                            type="checkbox"
                            checked={cadLayer.visible}
                            onChange={() => toggleLayer(cadLayer.id)}
                          />
                          <span className="layer-name">{cadLayer.name}</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                               <div className="maps-layer-section">
                  <div className="maps-layer-section-title row-between">
                    <span>Geodetic Survey Marks</span>
                    <button
                      type="button"
                      className="btn-pill"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={toggleGeodeticAll}
                      title="Toggle all geodetic layers"
                    >
                      {geodeticAnyOn ? "All off" : "All on"}
                    </button>
                  </div>

                  <div className="layers-list">
                    {[ssmLayer, bmLayer, rmLayer]
                      .filter(Boolean)
                      .map((l) => (
                        <div key={l.id} className="layer-row layer-row-compact">
                          <label className="layer-left">
                            <input
                              type="checkbox"
                              checked={l.visible}
                              onChange={() => toggleLayer(l.id)}
                            />
                            <span className="layer-name">{l.name}</span>
                          </label>
                        </div>
                      ))}
                  </div>                
                </div>
<div className="maps-layer-section">
  <div className="maps-layer-section-title">Services</div>
  <div className="layers-list">
    {layers
      .filter((l) => ["sewer068", "sewer026"].includes(l.id))
      .map((l) => (
        <div key={l.id} className="layer-row layer-row-compact">
          <label className="layer-left">
            <input
              type="checkbox"
              checked={l.visible}
              onChange={() => toggleLayer(l.id)}
            />
            <span className="layer-name">{l.name}</span>
          </label>
        </div>
      ))}
  </div>
</div>
                <div className="maps-layer-section">
                  <div className="maps-layer-section-title">Local Authority</div>
                  <div className="layers-list">
                    {layers
  .filter((l) => ["lga233", "localities234"].includes(l.id))
                      .map((l) => (
                        <div key={l.id} className="layer-row layer-row-compact">
                          <label className="layer-left">
                            <input
                              type="checkbox"
                              checked={l.visible}
                              onChange={() => toggleLayer(l.id)}
                            />
                            <span className="layer-name">{l.name}</span>
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="maps-layer-section">
  <div className="maps-layer-section-title">Planning</div>
  <div className="layers-list">
    {layers
      .filter((l) => l.id === "zoning070")
      .map((l) => (
        <div key={l.id} className="layer-row layer-row-compact">
          <label className="layer-left">
            <input
              type="checkbox"
              checked={l.visible}
              onChange={() => toggleLayer(l.id)}
            />
            <span className="layer-name">{l.name}</span>
          </label>
        </div>
      ))}
  </div>
</div>
              </div>
            )}

            {/* =========================
                TAB: NOTES
               ========================= */}
            
            {activeTab === "notes" && (
              <div className="panel-card" style={{ overflow: "hidden" }}>
                <div
                  className="panel-card-title"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span>Notes</span>

                  <button
                    type="button"
                    className={`btn-pill ${noteAddMode ? "primary" : ""}`}
                    style={{ padding: "6px 8px", fontSize: 11, flexShrink: 0 }}
disabled={
  !!measureModeRef.current ||
  exportPanelOpen ||
  !!exportModeRef.current ||
  exportHasFence ||
  exportDialogOpen
}
title={
  measureModeRef.current
    ? "Clear measurement first"
    : exportPanelOpen || exportHasFence || exportDialogOpen || exportModeRef.current
    ? "Finish or clear export first"
    : noteAddMode
    ? "Tap on the map to place a note"
    : "Add a note by tapping on the map"
}
                    onClick={() => setNoteAddMode((v) => !v)}
                  >
                    {noteAddMode ? "Tap map…" : "Add note"}
                  </button>
                </div>

                {/* Filter controls */}
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 900,
                      opacity: 0.9,
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!showAllNotes}
                      onChange={(e) => setShowAllNotes(e.target.checked)}
                      style={{ transform: "scale(1.05)" }}
                    />
                    Show All Notes
                  </label>

                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                    {showAllNotes
                      ? "Showing all notes"
                      : portalSelectedJobId
                      ? `Showing notes for job #${selectedPortalJobNumber || "—"}`
                      : "No job selected — showing all notes"}
                  </div>
                </div>

                {measureModeRef.current ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      borderRadius: 12,
                      background: "rgba(255,165,0,0.14)",
                      border: "1px solid rgba(0,0,0,0.10)",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Measurement is active — clear it first to drop a note.
                  </div>
                ) : null}

                {noteAddMode ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      borderRadius: 12,
                      background: "rgba(25,118,210,0.10)",
                      border: "1px solid rgba(0,0,0,0.10)",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Tap anywhere on the map to place the note.
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: "rgba(255,255,255,0.98)",
                  }}
                >
                  {(!visibleNotes || visibleNotes.length === 0) && (
                    <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.85 }}>
                      No notes yet. Hit <b>Add note</b>, then tap on the map.
                    </div>
                  )}

                  {(visibleNotes || [])
                    .slice()
                    .sort((a, b) =>
                      String(b.created_at || "").localeCompare(String(a.created_at || ""))
                    )
                    .map((n, idx, arr) => {
                      const preview = (n.text || "").split(/\r?\n/)[0].trim() || "—";
                      const time = formatNoteTime(n.created_at);
                      const borderBottom =
                        idx < arr.length - 1 ? "1px solid rgba(0,0,0,0.08)" : "none";

                      const canManageNote =
                        !!currentUserIsAdmin ||
                        (currentUserId && String(n.created_by || "") === String(currentUserId)) ||
                        (!n.created_by &&
                          currentUserName &&
                          String(n.created_by_name || "").toLowerCase() ===
                            String(currentUserName).toLowerCase());

                      return (
                        <div
                          key={n.id}
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                            padding: "10px 10px",
                            borderBottom,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => openNoteInfo(n.id, { zoom: true })}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              textAlign: "left",
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                            title="Zoom to note"
                          >
                            <div style={{ fontWeight: 950, color: "#111", fontSize: 13 }}>
                              📝 {preview.length > 40 ? preview.slice(0, 40) + "…" : preview}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2, whiteSpace: "nowrap" }}>{time}</div>
                            {n.job_number ? (
                              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, fontWeight: 900 }}>
                                Attached to Job #{n.job_number}
                              </div>
                            ) : null}
                            {n.created_by_name ? (
                              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{n.created_by_name}</div>
                            ) : null}
                          </button>

                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexShrink: 0,
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              className="btn-pill"
                              style={{ padding: "6px 8px", fontSize: 11, flexShrink: 0 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openNoteInfo(n.id, { zoom: true });
                              }}
                            >
                              Zoom
                            </button>

                            {canManageNote && (
                              <button
                                type="button"
                                className="btn-pill"
                                style={{ padding: "6px 8px", fontSize: 11, flexShrink: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openNoteInfo(n.id, { zoom: true, startEdit: true });
                                }}
                              >
                                Edit
                              </button>
                            )}

                            {canManageNote && (
                              <button
                                type="button"
                                className="btn-pill"
                                style={{ padding: "6px 8px", fontSize: 11, flexShrink: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNoteById(n.id);
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}</div>

                <div className="maps-layer-hint" style={{ marginTop: 10 }}>
                  {notesSyncError ? notesSyncError : "Notes are synced via Supabase and cached on this device for fast load."}
                </div>
              </div>
            )}
{/* =========================
                TAB: LEGEND
               ========================= */}
            {activeTab === "legend" && (
              <div className="panel-card">
                <div className="panel-card-title">Legend</div>
 <div className="maps-legend-row">
                    <span className="maps-legend-line" />
                    <div>
                      <div className="maps-legend-title">Cadastre</div>
                      <div className="maps-legend-sub">LGATE-001 (thin white boundary)</div>
                    </div>
                  </div>
                <div className="maps-legend">
                  <div className="maps-legend-row">
                    <span className="maps-legend-swatch swatch-ssm" />
                    <div>
                      <div className="maps-legend-title">SSM</div>
                      <div className="maps-legend-sub">LGATE-076 (triangle)</div>
                    </div>
                  </div>

                  <div className="maps-legend-row">
                    <span className="maps-legend-swatch swatch-bm" />
                    <div>
                      <div className="maps-legend-title">BM</div>
                      <div className="maps-legend-sub">LGATE-076 (square)</div>
                    </div>
                  </div>

                  <div className="maps-legend-row">
                    <span className="maps-legend-swatch swatch-rm" />
                    <div>
                      <div className="maps-legend-title">RM</div>
                      <div className="maps-legend-sub">LGATE-199 (cross)</div>
                    </div>
                  </div>

                  <div className="maps-legend-row">
  <span
    className="maps-legend-line"
       style={{ background: "#ff4da6", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">Sewer Gravity Pipes</div>
    <div className="maps-legend-sub">WCORP-068 (pink utility line)</div>
  </div>
</div>
<div className="maps-legend-row">
  <span
    className="maps-legend-swatch"
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: "#ff4da6",
      border: "1.5px solid #ffffff",
    }}
  />
  <div>
    <div className="maps-legend-title">Sewer Manholes</div>
    <div className="maps-legend-sub">WCORP-026 (pink point)</div>
  </div>
</div>
                  <div className="maps-legend-row">
                    <span
                      className="maps-legend-line"
                      style={{ background: "#0b5d1e", height: 2 }}
                    />
                    <div>
                      <div className="maps-legend-title">Local Authority</div>
                     <div className="maps-legend-sub">LGATE-233 (green boundary, light green fill + label)</div>
                    </div>
                  </div>
                  <div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#1976d2", height: 2 }}
  />
  <div>
    <div className="maps-legend-title">Localities</div>
    <div className="maps-legend-sub">LGATE-234 (blue boundary, light blue fill + label)</div>
  </div>
</div>
                  <div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#c62828", height: 2 }}
  />
  <div>
    <div className="maps-legend-title">R-Codes Zoning</div>
    <div className="maps-legend-sub">DPLH-070 (red boundary, light red fill + zoning labels)</div>
  </div>
</div>

                  <div className="maps-legend-row">
                    <span
                      className="maps-legend-swatch"
                      style={{
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "50%",
                        width: 16,
                        height: 16,
                        background: "#FFD54F",
                        border: "2px solid #111",
                        fontWeight: 900,
                        fontSize: 11,
                        color: "#111",
                      }}
                    >
                      N
                    </span>
                    <div>
                      <div className="maps-legend-title">Notes</div>
                      <div className="maps-legend-sub">Pinned note (yellow “N”)</div>
                    </div>
                  </div>

                  <div className="maps-legend-divider" />

                  <div className="maps-legend-sub" style={{ fontWeight: 800 }}>
                    Tools
                  </div>
                  <div className="maps-legend-tools">
                    <div>📏 Distance</div>
                    <div>📐 Area</div>
                    <div>📍 My location</div>
                    <div>🕘 Historical (Earth)</div>
                    <div>👤 Street View</div>
<div>ℹ Map information</div>
<div>⬇ Export visible layers</div>
  <div>✔ Finish measurement</div>
  <div>✖ Clear measurement</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Maps;