import { useEffect, useRef, useState, useMemo } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

/**
 * Safe Point constructor:
 * If google maps is already loaded, use google.maps.Point.
 * Otherwise, use a dummy Point-like constructor so Vite/Babel doesn't choke.
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

// --- demo jobs (unchanged) ---
const jobs = [
  {
    id: "24051",
    name: "3 Lot Subdivision",
    suburb: "Hillarys",
    address: "23 Smith St, Hillarys WA",
    lat: -31.815,
    lng: 115.744,
  },
  {
    id: "24052",
    name: "Strata Check",
    suburb: "Joondalup",
    address: "12 Lakeside Dr, Joondalup WA",
    lat: -31.746,
    lng: 115.768,
  },
  {
    id: "24053",
    name: "Construction Setout",
    suburb: "Osborne Park",
    address: "45 Main St, Osborne Park WA",
    lat: -31.903,
    lng: 115.815,
  },
];

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
      <div style="font-weight:800; font-size:14px; margin-bottom:8px; color:#111;">
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

function Maps() {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userLocationMarkerRef = useRef(null);
  const addressMarkerRef = useRef(null);
  const addressInputRef = useRef(null);

  const infoWindowRef = useRef(null);

  const geodeticMarkersRef = useRef({
    ssm076: [],
    bm076: [],
    rm199: [],
  });

  const geodeticMarkerIndexRef = useRef({
    ssm076: new Map(),
    bm076: new Map(),
    rm199: new Map(),
  });

  const clustererRef = useRef(null);

  const viewRef = useRef({ bounds: null, zoom: null });
  const idleDebounceRef = useRef(null);
  const lastFetchRef = useRef({ ssm076: 0, rm199: 0, cad001: 0 });

  // ✅ Cadastre Data layer ref
  const cadastreDataRef = useRef(null);

  // --- Measure ---
  const measureModeRef = useRef(null); // "distance" | "area" | null
  const measurePathRef = useRef([]);
  const measureLineRef = useRef(null);
  const measurePolyRef = useRef(null);
  const measureLiveIWRef = useRef(null);
  const measureFinalIWRef = useRef(null);
  const measureListenersRef = useRef([]);

  // ✅ Custom top tools control ref
  const toolsControlDivRef = useRef(null);

  // ✅ Store live (non-destroyed) SSM/BM points currently in view for RM radius filter
  const liveParentsRef = useRef([]); // array of { lat, lng }

  const [jobQuery, setJobQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedAddress, setSelectedAddress] = useState(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const [layers, setLayers] = useState([]);

  const [geodeticNotice, setGeodeticNotice] = useState("");
  const [viewTick, setViewTick] = useState(0);

  const [measureMode, setMeasureMode] = useState(null);
  const [hasMeasure, setHasMeasure] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || null,
    [selectedJobId]
  );

  const filteredJobs = useMemo(() => {
    if (!jobQuery.trim()) return jobs;
    const q = jobQuery.toLowerCase();
    return jobs.filter(
      (job) =>
        job.id.toLowerCase().includes(q) ||
        job.name.toLowerCase().includes(q) ||
        job.suburb.toLowerCase().includes(q) ||
        job.address.toLowerCase().includes(q)
    );
  }, [jobQuery]);

  // Initialise map once
  useEffect(() => {
    if (!window.google || !mapDivRef.current || mapRef.current) return;

    const map = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: -31.95, lng: 115.86 },
      zoom: 10,
      mapTypeId: "hybrid",
      mapTypeControl: true,
      fullscreenControl: true,
      streetViewControl: true, // ✅ bring Pegman back
      clickableIcons: false,
      controlSize: 28,
      gestureHandling: "greedy",
    });

    mapRef.current = map;
    infoWindowRef.current = new window.google.maps.InfoWindow();

    // ✅ Add top horizontal tools control next to mapType buttons
    if (!toolsControlDivRef.current) {
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.gap = "6px";
      div.style.marginLeft = "8px";
      div.style.alignItems = "center";
      div.style.padding = "4px";
      div.style.background = "rgba(255,255,255,0.9)";
      div.style.border = "2px solid #000";
      div.style.borderRadius = "8px";
      div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";

      const makeBtn = (label, title, action) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.title = title;
        b.dataset.action = action;
        b.style.width = "34px";
        b.style.height = "28px";
        b.style.borderRadius = "6px";
        b.style.border = "2px solid #000";
        b.style.background = "#fff";
        b.style.color = "#000";
        b.style.fontWeight = "900";
        b.style.fontSize = "15px";
        b.style.cursor = "pointer";
        b.style.display = "grid";
        b.style.placeItems = "center";
        b.style.lineHeight = "1";
        return b;
      };

      const distBtn = makeBtn("📏", "Measure distance (metres)", "distance");
      const areaBtn = makeBtn("📐", "Measure area (m² / ha)", "area");
      const locBtn = makeBtn("📍", "My location", "location");
      const histBtn = makeBtn(
        "🕘",
        "Historical imagery (opens Google Earth)",
        "history"
      );
      const svBtn = makeBtn("👤", "Street View at map centre", "streetview");
      const clearBtn = makeBtn("✖", "Clear measurement", "clear");
      clearBtn.style.display = "none"; // hidden until needed

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
        if (isVis) {
          sv.setVisible(false);
        } else {
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
      div.appendChild(clearBtn);

      map.controls[window.google.maps.ControlPosition.TOP_LEFT].push(div);
      toolsControlDivRef.current = div;
    }

    map.addListener("idle", () => {
      if (idleDebounceRef.current) clearTimeout(idleDebounceRef.current);

      idleDebounceRef.current = setTimeout(() => {
        if (!mapRef.current) return;

        viewRef.current = {
          bounds: mapRef.current.getBounds(),
          zoom: mapRef.current.getZoom(),
        };

        setViewTick((t) => t + 1);
      }, REFRESH_DEBOUNCE_MS);
    });

    if (window.google.maps.places && addressInputRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(
        addressInputRef.current,
        {
          types: ["geocode"],
          componentRestrictions: { country: "au" },
        }
      );

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        const loc = place.geometry.location;
        const position = { lat: loc.lat(), lng: loc.lng() };

        mapRef.current.setCenter(position);
        mapRef.current.setZoom(17);

        const addressString =
          place.formatted_address || place.name || "Selected location";

        if (!addressMarkerRef.current) {
          addressMarkerRef.current = new window.google.maps.Marker({
            position,
            map: mapRef.current,
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
        }

        setSelectedAddress({
          address: addressString,
          lat: position.lat,
          lng: position.lng,
        });
      });
    }
  }, []);

  // ✅ keep top tools visual state in sync (active + clear visibility)
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
  }, [measureMode, hasMeasure]);

  // Create job markers once
  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    markersRef.current.forEach((m) => m.marker.setMap(null));
    markersRef.current = [];

    jobs.forEach((job) => {
      const marker = new window.google.maps.Marker({
        position: { lat: job.lat, lng: job.lng },
        map: mapRef.current,
        title: `${job.id} – ${job.name}`,
      });

      marker.addListener("click", () => setSelectedJobId(job.id));
      markersRef.current.push({ jobId: job.id, marker });
    });
  }, []);

  // Zoom to selected job
  useEffect(() => {
    if (!mapRef.current || !window.google || !selectedJob) return;

    mapRef.current.setCenter({ lat: selectedJob.lat, lng: selectedJob.lng });
    mapRef.current.setZoom(15);

    const markerObj = markersRef.current.find((m) => m.jobId === selectedJob.id);
    if (markerObj) {
      markerObj.marker.setAnimation(window.google.maps.Animation.BOUNCE);
      setTimeout(() => markerObj.marker.setAnimation(null), 700);
    }
  }, [selectedJob]);

  const handleSelectJob = (job) => {
    setSelectedJobId(job.id);
    setJobQuery(`${job.id} – ${job.name}`);
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        mapRef.current.setCenter(position);
        mapRef.current.setZoom(17);

        if (!userLocationMarkerRef.current) {
          userLocationMarkerRef.current = new window.google.maps.Marker({
            position,
            map: mapRef.current,
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
    if (measureLiveIWRef.current) {
      measureLiveIWRef.current.close();
    }
    if (measureFinalIWRef.current) {
      measureFinalIWRef.current.close();
    }

    measureModeRef.current = null;
    setMeasureMode(null);
    setHasMeasure(false);
  };

  const updateLiveMeasure = (lastLatLng) => {
    const map = mapRef.current;
    const path = measurePathRef.current;

    if (!map || path.length < 2) return;

    let value = 0;
    if (
      window.google.maps.geometry &&
      window.google.maps.geometry.spherical
    ) {
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

    let label = "";
    if (measureModeRef.current === "distance") {
      const meters = value;
      label =
        meters >= 1000
          ? `${meters.toFixed(2)} m (${(meters / 1000).toFixed(3)} km)`
          : `${meters.toFixed(2)} m`;
      label = `Distance: ${label}`;
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
    measureLiveIWRef.current.setContent(
      `<div style="font-weight:800; font-size:13px;">${label}<br/><span style="font-weight:600; color:#666;">Right-click or double-click to finish</span></div>`
    );
    measureLiveIWRef.current.setPosition(lastLatLng);
    measureLiveIWRef.current.open(map);
  };

  const finishMeasure = () => {
    const map = mapRef.current;
    const path = measurePathRef.current;
    if (!map || path.length < 2) return;

    updateLiveMeasure(path[path.length - 1]);

    clearMeasureListeners();
    setHasMeasure(true);
    setMeasureMode(null);
    measureModeRef.current = null;

    measureFinalIWRef.current = measureLiveIWRef.current;
    measureLiveIWRef.current = null;
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

  // ---------- Inject geodetic + cadastre layers (DEFAULT OFF) ----------
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

  // ---------- FAST geodetic render + clustering ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

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
        liveParentsRef.current = []; // ✅ no parents available
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

        const liveFeats = geojson.features.filter(
          (f) => !isDestroyed(f.properties)
        );

        // ✅ Update live parent list for RM proximity filtering
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

        // ✅ If no live SSM/BM parents in view, show NO RMs (strict rule)
        const parents = liveParentsRef.current || [];
        if (!parents.length) {
          clearLayer("rm199");
          return;
        }

        const distMeters = (a, b) => {
          if (
            window.google?.maps?.geometry?.spherical &&
            window.google.maps.LatLng
          ) {
            const A = new window.google.maps.LatLng(a.lat, a.lng);
            const B = new window.google.maps.LatLng(b.lat, b.lng);
            return window.google.maps.geometry.spherical.computeDistanceBetween(
              A,
              B
            );
          }
          return haversineMeters(a, b);
        };

        const RM_PARENT_RADIUS_M = 20;

        // ✅ Keep only RMs within 20m of ANY live SSM/BM
        const rmFiltered = liveFeats.filter((rm) => {
          const [lng, lat] = rm.geometry.coordinates;
          const rmPt = { lat, lng };

          for (let i = 0; i < parents.length; i++) {
            if (distMeters(rmPt, parents[i]) <= RM_PARENT_RADIUS_M) {
              return true;
            }
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
      syncClusterer();
    })();

    const staleTimer = setInterval(() => {
      const anyVisible =
        ssmLayer?.visible || bmLayer?.visible || rmLayer?.visible;
      if (anyVisible) setViewTick((t) => t + 1);
    }, STALE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(staleTimer);
    };
  }, [layers, viewTick]);

  // ✅ Cadastre (plain white, thin)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

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

    const loadCadastre = async () => {
      try {
        const geojson = await fetchArcgisGeojsonInView(
          cadLayer.data.url,
          bounds,
          "1=1"
        );
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
    };

    loadCadastre();
    return () => {
      cancelled = true;
    };
  }, [layers, viewTick]);

  const toggleLayer = (id) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

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

        {/* Right retractable legend/layers panel */}
        <div className={`maps-rightpanel ${panelOpen ? "open" : "closed"}`}>
          <button
            className="panel-toggle"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? "‹" : "›"}
          </button>

          <div className="panel-content">
            <div className="panel-card">
              <div className="panel-card-title">Jobs</div>
              <input
                type="text"
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
                placeholder="Search jobs by ID, suburb, address…"
                className="maps-search-input"
              />

              {jobQuery.trim() && (
                <div className="maps-job-list">
                  {filteredJobs.length === 0 && (
                    <div className="maps-empty">No jobs match this search.</div>
                  )}

                  {filteredJobs.map((job) => {
                    const isSelected = job.id === selectedJobId;
                    return (
                      <button
                        key={job.id}
                        className={`maps-job-item ${
                          isSelected ? "selected" : ""
                        }`}
                        onClick={() => handleSelectJob(job)}
                      >
                        <div className="maps-job-id">Job {job.id}</div>
                        <div className="maps-job-name">{job.name}</div>
                        <div className="maps-job-suburb">{job.suburb}</div>
                        <div className="maps-job-address">{job.address}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="panel-card">
              <div className="panel-card-title">Address</div>
              <input
                type="text"
                ref={addressInputRef}
                placeholder="Search any street address…"
                className="maps-search-input"
              />
            </div>

            <div className="panel-card">
              <div
                className="panel-card-title row-between clickable"
                onClick={() => setLayersOpen((v) => !v)}
              >
                <span>Layers</span>
                <span className="chev">{layersOpen ? "▾" : "▸"}</span>
              </div>

              {layersOpen && (
                <>
                  {geodeticNotice && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#666",
                        margin: "4px 0 8px 0",
                        padding: "6px 8px",
                        background: "#fafafa",
                        border: "1px dashed #ddd",
                        borderRadius: "8px",
                      }}
                    >
                      {geodeticNotice}
                    </div>
                  )}

                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "13px",
                      margin: "8px 0 4px 0",
                      color: "#333",
                    }}
                  >
                    Cadastre
                  </div>

                  <div className="layers-list">
                    {layers
                      .filter((l) => ["cad001"].includes(l.id))
                      .map((l) => (
                        <div key={l.id} className="layer-row">
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

                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "13px",
                      margin: "8px 0 4px 0",
                      color: "#333",
                    }}
                  >
                    Geodetic Survey Marks
                  </div>

                  <div className="layers-list">
                    {layers
                      .filter((l) =>
                        ["ssm076", "bm076", "rm199"].includes(l.id)
                      )
                      .map((l) => (
                        <div key={l.id} className="layer-row">
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Selected job card */}
        {selectedJob && (
          <div className="maps-selected-card">
            <div className="maps-selected-title">
              {selectedJob.id} – {selectedJob.name}
            </div>
            <div className="maps-selected-suburb">{selectedJob.suburb}</div>
            <div className="maps-selected-address">{selectedJob.address}</div>

            <div className="maps-selected-buttons">
              <a
                href={buildSearchUrl(selectedJob.address)}
                target="_blank"
                rel="noreferrer"
                className="maps-btn-outline"
              >
                🔍 Open in Google Maps
              </a>
              <a
                href={buildDirectionsUrl(selectedJob.lat, selectedJob.lng)}
                target="_blank"
                rel="noreferrer"
                className="maps-btn-solid"
              >
                🚗 Directions
              </a>
            </div>
          </div>
        )}

        {/* Address card */}
        {selectedAddress && (
          <div
            className="maps-selected-card"
            style={{ bottom: selectedJob ? "5.6rem" : "0.75rem" }}
          >
            <div className="maps-selected-title">Address search</div>
            <div className="maps-selected-address">
              {selectedAddress.address}
            </div>

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
                href={buildDirectionsUrl(
                  selectedAddress.lat,
                  selectedAddress.lng
                )}
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
