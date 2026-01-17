import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import proj4 from "proj4";
import { supabase } from "../lib/supabaseClient.js";
import { useAppVisibilityContext } from "../context/AppVisibilityContext.jsx";

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
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
function buildSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}
function buildLatLngSearchUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
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

  const pcgE = firstProp(props, [
    "pcg2020_easting",
    "project_grid_easting",
    "projectgrid_easting",
    "proj_grid_e",
    "pg_easting",
  ]);
  const pcgN = firstProp(props, [
    "pcg2020_northing",
    "project_grid_northing",
    "projectgrid_northing",
    "proj_grid_n",
    "pg_northing",
  ]);

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
        )}" target="_blank" rel="noreferrer"
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
/* ------------------------------------------------------------------- */

/* ================================
   ✅ Portal Jobs: MGA2020 -> WGS84
   ================================ */
proj4.defs(
  "EPSG:7850",
  "+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs"
);
proj4.defs(
  "EPSG:7851",
  "+proj=utm +zone=51 +south +ellps=GRS80 +units=m +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

function mgaToWgs84(zone, easting, northing) {
  const z = Number(zone);
  const e = Number(easting);
  const n = Number(northing);
  if (!z || !Number.isFinite(e) || !Number.isFinite(n)) return null;
  const src = z === 51 ? "EPSG:7851" : "EPSG:7850";
  const [lon, lat] = proj4(src, "EPSG:4326", [e, n]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lng: lon };
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

function Maps() {
  const location = useLocation();
  const navigate = useNavigate();
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

  const markersRef = useRef([]);
  const userLocationMarkerRef = useRef(null);
  const addressMarkerRef = useRef(null);

  const addressInputRef = useRef(null);
  const addressAutocompleteRef = useRef(null);

  const infoWindowRef = useRef(null);
  const hoverInfoWindowRef = useRef(null);

  const isAppVisible = useAppVisibilityContext();

  /* ================================
     ✅ Missing refs/state restored (full sweep)
     ================================ */

  // UI + view tick
  const [layers, setLayers] = useState([]);
  const [geodeticNotice, setGeodeticNotice] = useState("");
  const [viewTick, setViewTick] = useState(0);

  const toolsControlDivRef = useRef(null);
  const idleDebounceRef = useRef(null);
  const viewRef = useRef({ bounds: null, zoom: null });

  // Fetch throttles + caches
  const lastFetchRef = useRef({ ssm076: 0, rm199: 0, cad001: 0 });
  const liveParentsRef = useRef([]);

  // Geodetic markers
  const geodeticMarkersRef = useRef({ ssm076: [], bm076: [], rm199: [] });
  const geodeticMarkerIndexRef = useRef({
    ssm076: new Map(),
    bm076: new Map(),
    rm199: new Map(),
  });
  const clustererRef = useRef(null);

  // Cadastre
  const cadastreDataRef = useRef(null);

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
  const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(false);

  useEffect(() => {
    const onResize = () => {
      try {
        const mobile = typeof window !== "undefined" && window.innerWidth <= 900;
        setIsMobile(mobile);
        if (!mobile) setMobilePanelCollapsed(false); // never hide panel on desktop
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

  // Keep a small cache for instant load + basic offline viewing
  useEffect(() => {
    try {
      localStorage.setItem(MAP_NOTES_CACHE_KEY, JSON.stringify(visibleNotes || []));
    } catch {
      // ignore
    }
  }, [visibleNotes]);

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

    const note = (visibleNotes || []).find((n) => n.id === id);
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

          try {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving…";
          } catch {
            // ignore
          }

          const prevNotes = mapNotes || [];
          setMapNotes((prev) =>
            (prev || []).map((n) => (n.id === id ? { ...n, text: newText } : n))
          );

          try {
            const { error } = await supabase
              .from("map_notes")
              .update({ text: newText })
              .eq("id", id);
            if (error) throw error;

            hideEdit();
            // Refresh the popup view with the updated text
            setTimeout(() => openNoteInfo(id, { zoom: false }), 0);
          } catch (e) {
            console.error("Edit note failed:", e);
            setMapNotes(prevNotes);
            alert("Couldn’t update note. Check your connection and try again.");
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

            const notePayload = {
              text,
              lat,
              lng,
              created_by: currentUserId || null,
              created_by_name: currentUserName || null,
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
    return (portalJobs || [])
      .filter((j) => String(j.job_number ?? "").includes(q))
      .sort((a, b) => Number(b.job_number) - Number(a.job_number))
      .slice(0, 12);
  }, [jobNumberQuery, portalJobs]);

  // ✅ Reset keyboard highlight when query/suggestions change
  useEffect(() => {
    setJobNumberActiveIndex(-1);
  }, [jobNumberQuery, jobPicked, jobNumberSuggestions.length]);

  // Initialise map once
  useEffect(() => {
    if (!window.google || !mapDivRef.current || mapRef.current) return;

    const mobile = isSmallScreen();

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
    });

    mapRef.current = map;
    infoWindowRef.current = new window.google.maps.InfoWindow();
    hoverInfoWindowRef.current = new window.google.maps.InfoWindow({
      disableAutoPan: true,
    });
    noteInfoWindowRef.current = new window.google.maps.InfoWindow();
    noteComposerIWRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });

    // ✅ Render saved notes immediately
    try {
      syncNoteMarkers(visibleNotes);
    } catch {
      // ignore
    }

    // ✅ Add top horizontal tools
    if (!toolsControlDivRef.current) {
      const div = document.createElement("div");
      div.className = "maps-tools-bar";
      div.style.display = "flex";
      div.style.gap = "6px";
      div.style.marginLeft = "8px";
      div.style.alignItems = "center";
      div.style.padding = "4px";
      div.style.background = "rgba(255,255,255,0.9)";
      div.style.border = "2px solid #000";
      div.style.borderRadius = "8px";
      div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";

      const btnW = mobile ? 30 : 34;
      const btnH = mobile ? 26 : 28;
      const fontSize = mobile ? "14px" : "15px";

      const makeBtn = (label, title, action) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.title = title;
        b.dataset.action = action;
        b.style.width = `${btnW}px`;
        b.style.height = `${btnH}px`;
        b.style.borderRadius = "6px";
        b.style.border = "2px solid #000";
        b.style.background = "#fff";
        b.style.color = "#000";
        b.style.fontWeight = "900";
        b.style.fontSize = fontSize;
        b.style.cursor = "pointer";
        b.style.display = "grid";
        b.style.placeItems = "center";
        b.style.lineHeight = "1";
        return b;
      };

      const distBtn = makeBtn("📏", "Measure distance (metres)", "distance");
      const areaBtn = makeBtn("📐", "Measure area (m² / ha)", "area");
      const locBtn = makeBtn("📍", "My location", "location");
      const histBtn = makeBtn("🕘", "Historical imagery (opens Google Earth)", "history");
      const svBtn = makeBtn("👤", "Street View at map centre", "streetview");
      const clearBtn = makeBtn("✖", "Clear measurement", "clear");
      clearBtn.style.display = "none";

      const finishBtn = makeBtn("✔", "Finish measurement", "finish");
      finishBtn.style.display = "none";
      finishBtn.onclick = () => finishMeasure();

      distBtn.onclick = () => startDistanceMeasure();
      areaBtn.onclick = () => startAreaMeasure();
      locBtn.onclick = () => handleMyLocation();
      histBtn.onclick = () => {
        const c = map.getCenter();
        const url = buildGoogleEarthUrl(c.lat(), c.lng(), map.getZoom());
        window.open(url, "_blank", "noreferrer");
      };
      svBtn.onclick = () => {
        const sv = map.getStreetView();
        const c = map.getCenter();
        const isVis = sv.getVisible();
        if (isVis) sv.setVisible(false);
        else {
          sv.setPosition(c);
          sv.setPov({ heading: 0, pitch: 0 });
          sv.setVisible(true);
        }
      };
      clearBtn.onclick = () => clearMeasure();

      div.appendChild(distBtn);
      div.appendChild(areaBtn);
      div.appendChild(locBtn);
      div.appendChild(histBtn);
      div.appendChild(svBtn);
      div.appendChild(finishBtn);
      div.appendChild(clearBtn);

      map.controls[window.google.maps.ControlPosition.TOP_LEFT].push(div);
      toolsControlDivRef.current = div;
    }

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

    const autocomplete = new window.google.maps.places.Autocomplete(input, {
      types: ["geocode"],
      componentRestrictions: { country: "au" },
      fields: ["geometry", "formatted_address", "name"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
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
    });

    addressAutocompleteRef.current = autocomplete;
  }, [activeTab]);

  // ✅ Keep top tools visual state in sync
  useEffect(() => {
    const div = toolsControlDivRef.current;
    if (!div) return;

    const btns = Array.from(div.querySelectorAll("button"));
    btns.forEach((b) => {
      const action = b.dataset.action;
      const active =
        (action === "distance" && measureMode === "distance") ||
        (action === "area" && measureMode === "area");

      b.style.background = active ? "#000" : "#fff";
      b.style.color = active ? "#fff" : "#000";
    });

    const clearBtn = div.querySelector('button[data-action="clear"]');
    if (clearBtn) clearBtn.style.display = hasMeasure ? "grid" : "none";

    const finishBtn = div.querySelector('button[data-action="finish"]');
    if (finishBtn) finishBtn.style.display = measureMode ? "grid" : "none";
  }, [measureMode, hasMeasure]);


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
        .limit(5000);

      if (error) throw error;

      const arr = Array.isArray(data) ? data : [];
      setPortalJobs(arr);

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
  }, [mapRef.current]);

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
    const mobile = isSmallScreen();
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
          <a href="${buildDirectionsUrl(pt.lat, pt.lng)}" target="_blank" rel="noreferrer"
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

    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; font-size: 12px; min-width: 220px;">
        <div style="font-weight:900; font-size:13px; color:#111;">Job #${job.job_number}</div>
        <div style="font-weight:800; color:#333; margin-top:2px;">${safeClient}</div>
        <div style="color:#111; margin-top:2px;">${safeAddr}</div>
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

marker = new window.google.maps.Marker({
  position: pt,
  map: null,
  title: `Job #${job.job_number}\n${safeClient}\n${safeAddr}`,
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

    // if "All Jobs" is OFF, still show ONLY this job (desired behaviour)
    // if it's ON, it will remain ON and this pin will go green.
    // (no extra action needed)
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

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        if (!map) return;

        const position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        map.setCenter(position);
        map.setZoom(17);

        if (!userLocationMarkerRef.current) {
          userLocationMarkerRef.current = new window.google.maps.Marker({
            position,
            map,
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
          if (!userLocationMarkerRef.current.getMap()) userLocationMarkerRef.current.setMap(map);
        }
      },
      () => alert("Unable to get your location (needs HTTPS).")
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

  // ---------- Inject geodetic + cadastre layers ----------
  useEffect(() => {
    setLayers((prev) => {
      const hasSSM = prev.some((l) => l.id === "ssm076");
      const hasBM = prev.some((l) => l.id === "bm076");
      const hasRM = prev.some((l) => l.id === "rm199");
      const hasCad = prev.some((l) => l.id === "cad001");
      const next = [...prev];

      if (!hasSSM)
        next.push({
          id: "ssm076",
          name: "SSMs (LGATE-076)",
          type: "geodetic-ssm",
          visible: false,
          data: { url: LGATE_076_QUERY },
        });

      if (!hasBM)
        next.push({
          id: "bm076",
          name: "BMs (LGATE-076)",
          type: "geodetic-bm",
          visible: false,
          data: { url: LGATE_076_QUERY },
        });

      if (!hasRM)
        next.push({
          id: "rm199",
          name: "RMs (LGATE-199)",
          type: "geodetic-rm",
          visible: false,
          data: { url: LGATE_199_QUERY },
        });

      if (!hasCad)
        next.push({
          id: "cad001",
          name: "Cadastre (LGATE-001)",
          type: "cadastre",
          visible: false,
          data: { url: LGATE_001_QUERY },
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

  // ---------- FAST geodetic render + clustering ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    if (!isAppVisible) return;

    const ssmLayer = layers.find((l) => l.id === "ssm076");
    const bmLayer = layers.find((l) => l.id === "bm076");
    const rmLayer = layers.find((l) => l.id === "rm199");

    const { bounds, zoom } = viewRef.current;
    const showLabels = zoom >= SHOW_LABELS_ZOOM;

    const anyGeodeticVisible =
      ssmLayer?.visible || bmLayer?.visible || rmLayer?.visible;

    const clearLayer = (key) => {
      const idx = geodeticMarkerIndexRef.current[key];
      for (const m of idx.values()) m.setMap(null);
      idx.clear();
      geodeticMarkersRef.current[key] = [];
    };

    const clearAllGeodetic = () => {
      clearLayer("ssm076");
      clearLayer("bm076");
      clearLayer("rm199");
    };

    const syncClusterer = () => {
      if (!clustererRef.current) {
        clustererRef.current = new MarkerClusterer({ map, markers: [] });
      }
      const visibleMarkers = [
        ...(ssmLayer?.visible ? geodeticMarkersRef.current.ssm076 : []),
        ...(bmLayer?.visible ? geodeticMarkersRef.current.bm076 : []),
        ...(rmLayer?.visible ? geodeticMarkersRef.current.rm199 : []),
      ];
      clustererRef.current.clearMarkers();
      if (visibleMarkers.length) clustererRef.current.addMarkers(visibleMarkers);
    };

    if (!anyGeodeticVisible) {
      setGeodeticNotice("");
      clearAllGeodetic();
      syncClusterer();
      return;
    }

    if (!bounds || zoom === null) return;

    if (zoom < MIN_GEODETIC_ZOOM) {
      setGeodeticNotice(`Zoom to ${MIN_GEODETIC_ZOOM}+ to see geodetic marks.`);
      clearAllGeodetic();
      syncClusterer();
      return;
    }

    let cancelled = false;

    const makeLabel = (text) => ({
      text: text || "",
      color: "#ffffff",
      fontSize: "10px",
      fontWeight: "700",
    });

    const syncLayerMarkers = (key, features, icon, layerTag, nameFromProps) => {
      const idx = geodeticMarkerIndexRef.current[key];
      const nextIds = new Set();

      for (const f of features) {
        const props = f.properties || {};
        const [lng, lat] = f.geometry.coordinates;

        const id =
          props.geodetic_point_pid ||
          props.reference_mark_pid ||
          props.point_number ||
          props.rm_point_number ||
          props.objectid ||
          props.OBJECTID ||
          props.fid ||
          `${lat.toFixed(6)},${lng.toFixed(6)}`;

        nextIds.add(id);

        const name = nameFromProps(props);

        let marker = idx.get(id);
        if (!marker) {
          marker = new window.google.maps.Marker({
            position: { lat, lng },
            map,
            icon,
            title: name,
            label: showLabels ? makeLabel(name) : null,
            optimized: true,
          });

          marker.addListener("click", () => {
            infoWindowRef.current.setContent(
              buildPopupHtmlExample({
                layerTag,
                name,
                props: { ...props, lat, lng },
              })
            );
            infoWindowRef.current.open(map, marker);
          });

          idx.set(id, marker);
        } else {
          marker.setPosition({ lat, lng });
          marker.setIcon(icon);
          marker.setTitle(name);
          marker.setLabel(showLabels ? makeLabel(name) : null);
          if (!marker.getMap()) marker.setMap(map);
        }
      }

      for (const [id, marker] of idx.entries()) {
        if (!nextIds.has(id)) {
          marker.setMap(null);
          idx.delete(id);
        }
      }

      geodeticMarkersRef.current[key] = Array.from(idx.values());
    };

    async function load076IfNeeded() {
      if (!(ssmLayer?.visible || bmLayer?.visible)) {
        liveParentsRef.current = [];
        clearLayer("ssm076");
        clearLayer("bm076");
        return;
      }

      const now = Date.now();
      if (now - lastFetchRef.current.ssm076 < FETCH_THROTTLE_MS) return;
      lastFetchRef.current.ssm076 = now;

      try {
        const geojson = await fetchArcgisGeojsonInView(
          LGATE_076_QUERY,
          bounds,
          "1=1"
        );
        if (cancelled) return;

        const liveFeats = geojson.features.filter((f) => !isDestroyed(f.properties));

        liveParentsRef.current = (liveFeats || []).map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          return { lat, lng };
        });

        if (liveFeats.length > MAX_FEATURES_PER_VIEW) {
          setGeodeticNotice(
            `Too many marks here (${liveFeats.length}). Zoom in further.`
          );
          clearLayer("ssm076");
          clearLayer("bm076");
          return;
        }

        setGeodeticNotice("");
        const { ssm, bm } = split076Features(liveFeats);

        if (ssmLayer?.visible) {
          syncLayerMarkers(
            "ssm076",
            ssm,
            ssmTriangleSymbol,
            "SSM",
            (p) => p.geodetic_point_name || p.point_number || "SSM"
          );
        } else clearLayer("ssm076");

        if (bmLayer?.visible) {
          syncLayerMarkers(
            "bm076",
            bm,
            bmSquareSymbol,
            "BM",
            (p) => p.geodetic_point_name || p.point_number || "BM"
          );
        } else clearLayer("bm076");
      } catch (e) {
        console.warn("076 load failed:", e);
        setGeodeticNotice("SSM/BM layer failed to load. Try zooming/panning.");
        clearLayer("ssm076");
        clearLayer("bm076");
      }
    }

    async function load199IfNeeded() {
      if (!rmLayer?.visible) {
        clearLayer("rm199");
        return;
      }

      const now = Date.now();
      if (now - lastFetchRef.current.rm199 < FETCH_THROTTLE_MS) return;
      lastFetchRef.current.rm199 = now;

      try {
        const where =
          "latest_status NOT LIKE '%DESTROY%' AND latest_status NOT LIKE '%REMOVE%'";
        const geojson = await fetchArcgisGeojsonInView(
          LGATE_199_QUERY,
          bounds,
          where
        );
        if (cancelled) return;

        const liveFeats = (geojson.features || []).filter(
          (f) => !isDestroyed(f.properties)
        );

        const parents = liveParentsRef.current || [];
        if (!parents.length) {
          clearLayer("rm199");
          return;
        }

        const distMeters = (a, b) => {
          if (window.google?.maps?.geometry?.spherical && window.google.maps.LatLng) {
            const A = new window.google.maps.LatLng(a.lat, a.lng);
            const B = new window.google.maps.LatLng(b.lat, b.lng);
            return window.google.maps.geometry.spherical.computeDistanceBetween(A, B);
          }
          return haversineMeters(a, b);
        };

        const RM_PARENT_RADIUS_M = 20;

        const rmFiltered = liveFeats.filter((rm) => {
          const [lng, lat] = rm.geometry.coordinates;
          const rmPt = { lat, lng };
          for (let i = 0; i < parents.length; i++) {
            if (distMeters(rmPt, parents[i]) <= RM_PARENT_RADIUS_M) return true;
          }
          return false;
        });

        if (rmFiltered.length > MAX_FEATURES_PER_VIEW) {
          setGeodeticNotice(
            `Too many RMs here (${rmFiltered.length}). Zoom in further.`
          );
          clearLayer("rm199");
          return;
        }

        setGeodeticNotice("");

        syncLayerMarkers(
          "rm199",
          rmFiltered,
          rmCrossSymbol,
          "RM",
          (p) =>
            p.reference_mark_name ||
            p.geodetic_point_name ||
            p.rm_point_number ||
            "RM"
        );
      } catch (e) {
        console.warn("199 load failed:", e);
        setGeodeticNotice("RM layer failed to load. Try zooming/panning.");
        clearLayer("rm199");
      }
    }

    (async () => {
      await Promise.all([load076IfNeeded(), load199IfNeeded()]);
      if (!clustererRef.current) clustererRef.current = new MarkerClusterer({ map, markers: [] });

      const visibleMarkers = [
        ...(ssmLayer?.visible ? geodeticMarkersRef.current.ssm076 : []),
        ...(bmLayer?.visible ? geodeticMarkersRef.current.bm076 : []),
        ...(rmLayer?.visible ? geodeticMarkersRef.current.rm199 : []),
      ];

      clustererRef.current.clearMarkers();
      if (visibleMarkers.length) clustererRef.current.addMarkers(visibleMarkers);
    })();

    if (!isAppVisible) return;
    const staleTimer = setInterval(() => {
      const anyVisible = ssmLayer?.visible || bmLayer?.visible || rmLayer?.visible;
      if (anyVisible) setViewTick((t) => t + 1);
    }, STALE_REFRESH_MS);

    return () => clearInterval(staleTimer);
  }, [layers, viewTick, isAppVisible]);

  // ✅ Cadastre (plain white, thin)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
   
    if (!isAppVisible) return;

    if (!cadastreDataRef.current) {
      cadastreDataRef.current = new window.google.maps.Data();
      cadastreDataRef.current.setMap(map);
      cadastreDataRef.current.setStyle({
        clickable: false,
        strokeColor: "#ffffff",
        strokeWeight: 0.9,
        fillOpacity: 0.0,
      });
    }

    const cadLayer = layers.find((l) => l.id === "cad001");
    const dataLayer = cadastreDataRef.current;
    const { bounds, zoom } = viewRef.current || {};

    if (!cadLayer?.visible || !bounds || (zoom ?? 0) < MIN_CADASTRE_ZOOM) {
      dataLayer.forEach((f) => dataLayer.remove(f));
      return;
    }

    const now = Date.now();
    if (now - lastFetchRef.current.cad001 < CADASTRE_FETCH_THROTTLE_MS) return;
    lastFetchRef.current.cad001 = now;

    let cancelled = false;

    (async () => {
      try {
        const geojson = await fetchArcgisGeojsonInView(cadLayer.data.url, bounds, "1=1");
        if (cancelled) return;

        if ((geojson.features?.length || 0) > MAX_CADASTRE_FEATURES_PER_VIEW) {
          console.warn("Cadastre: too many features in view, zoom in further.");
          return;
        }

        dataLayer.forEach((f) => dataLayer.remove(f));
        dataLayer.addGeoJson(geojson);
      } catch (err) {
        console.warn("Cadastre fetch failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
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
      </div>

      <div
        className="maps-mapwrap"
        style={{
          height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
          position: "relative",
        }}
      >
        <div ref={mapDivRef} className="maps-map" />

        {/* Left retractable panel */}
        <div
          className={`maps-rightpanel ${panelOpen ? "open" : "closed"}`}
          style={
            isMobile
              ? {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: "100vw",
                  maxHeight: "70vh",
                  transform: mobilePanelCollapsed ? "translateY(72%)" : "translateY(0)",
                  transition: "transform 180ms ease",
                  zIndex: 5,
                  overflowY: "auto",
                  overflowX: "hidden",
                  overflow: "visible",
                  paddingTop: 18,
                }
              : undefined
          }
        >
          {/* ✅ requested: toggle button on RIGHT edge of the tab */}
          <button
            type="button"
            className="maps-mobile-retract-toggle"
            onClick={() => setMobilePanelCollapsed((v) => !v)}
            title={mobilePanelCollapsed ? "Show panel" : "Hide panel"}
            style={{
              position: "absolute",
              top: -36,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              width: 54,
              height: 30,
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.18)",
              background: "rgba(255,255,255,0.96)",
              fontWeight: 900,
              display: isMobile ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {mobilePanelCollapsed ? "˄" : "˅"}
          </button>


          <div className="panel-content" style={{ fontSize: leftPanelFontSize }}>
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
                    onClick={() => fetchPortalJobs()}
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

                  <div className="maps-layer-hint">
                    Tip: zoom to <b>{MIN_GEODETIC_ZOOM}+</b> for marks, and{" "}
                    <b>{MIN_CADASTRE_ZOOM}+</b> for cadastre.
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
                    disabled={!!measureModeRef.current}
                    title={
                      measureModeRef.current
                        ? "Clear measurement first"
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
                    <span className="maps-legend-line" />
                    <div>
                      <div className="maps-legend-title">Cadastre</div>
                      <div className="maps-legend-sub">LGATE-001 (thin white boundary)</div>
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
                    <div>✖ Clear</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        

        {/* Address card */}
        {selectedAddress && (
          <div
            className="maps-selected-card"
            style={{ bottom: "0.75rem" }}
          >
            <div className="maps-selected-title">Address search</div>
            <div className="maps-selected-address">{selectedAddress.address}</div>

            <div className="maps-selected-buttons">
              <a
                href={buildSearchUrl(selectedAddress.address)}
                target="_blank"
                rel="noreferrer"
                className="maps-btn-outline"
              >
                🔍 Open in Google Maps
              </a>
              <a
                href={buildDirectionsUrl(selectedAddress.lat, selectedAddress.lng)}
                target="_blank"
                rel="noreferrer"
                className="maps-btn-solid"
              >
                🚗 Directions
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Maps;