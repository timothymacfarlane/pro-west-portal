import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import proj4 from "proj4";
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
import { cleanDisplayAddress } from "../lib/displayFormatters.js";
import { getJobAddressWarning } from "../lib/jobAddress.js";

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
const MRWA_RRM_QUERY =
  "https://services2.arcgis.com/cHGEnmsJ165IBJRM/arcgis/rest/services/Geodetic_Control_View/FeatureServer/0/query";
const LGATE_001_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/2/query"; // Cadastre (LGATE-001)
const LGATE_002_ADDRESS_LARGE_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/4/query"; // Cadastre Address (LGATE-002) - Large Scale
const LGATE_002_ADDRESS_SMALL_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses/MapServer/3/query"; // Cadastre Address (LGATE-002) - Small Scale
const LGATE_233_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Boundaries/MapServer/14/query"; // LGA Boundaries (LGATE-233)
const LGATE_234_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Boundaries/MapServer/16/query"; // Localities (LGATE-234)
const LGATE_BOUNDARIES_MAPSERVER =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Boundaries/MapServer";
const OBRM_001_QUERY = "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas/MapServer/17/query"; // Bush Fire Prone Areas (OBRM-001)
  const DPLH_070_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/111/query"; // R-Codes Zoning (DPLH-070)
const WCORP_068_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/17/query"; // Sewer Gravity Pipe (WCORP-068)
const WCORP_026_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/1/query"; // Sewer Manhole (WCORP-026)
const WCORP_084_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/19/query"; // Sewer Connection (WCORP-084)
const WCORP_083_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/18/query"; // Sewer Pressure Main (WCORP-083)  
const WCORP_002_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/20/query"; // Water Pipes (WCORP-002)
const WCORP_006_QUERY =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/0/query"; // Water Meters (WCORP-006)  
const DRAINAGE_PITS_QUERY =
  "https://services2.arcgis.com/cHGEnmsJ165IBJRM/arcgis/rest/services/Drainage_Pits_View/FeatureServer/0/query";
const DRAINAGE_PITS_KEY = "drainagePits";
const DRAINAGE_PITS_NAME = "Drainage Pits";
const DRAINAGE_PITS_OUT_FIELDS = ["OBJECTID", "Pit_Type"];
const DRAINAGE_PITS_QUERY_PAGE_SIZE = 2000;
const DRAINAGE_PITS_MAX_FEATURES_PER_VIEW = 6000;
const DRAINAGE_PIPES_QUERY =
  "https://services2.arcgis.com/cHGEnmsJ165IBJRM/arcgis/rest/services/Drainage_P_View/FeatureServer/3/query";
const DRAINAGE_PIPES_KEY = "drainagePipes";
const DRAINAGE_PIPES_NAME = "Drainage Pipes";
const DRAINAGE_PIPES_OUT_FIELDS = ["OBJECTID"];
const DRAINAGE_PIPES_QUERY_PAGE_SIZE = 2000;
const DRAINAGE_PIPES_MAX_FEATURES_PER_VIEW = 6000;
const WP_034_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer/8/query"; // Distribution Underground Cables (WP-034)
const WP_031_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer/10/query"; // Distribution Overhead Powerlines (WP-031)
const WP_029_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer/2/query"; // Distribution Poles (WP-029)
const WP_035_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer/9/query"; // Transmission Underground Cable (WP-035)
const WP_032_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer/11/query"; // Transmission Overhead Powerlines (WP-032)
const WP_030_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer/1/query"; // Transmission Pole(WP-030)
const WP_051_QUERY =
  "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/NCMT_Public_Secure_Services/MapServer/2/query"; // NCMT High Voltage Overhead Transmission Lines (WP-051)
const DPIRD_CONTOURS_MAPSERVER =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Terrain/MapServer";
const DPIRD_CONTOUR_IDENTIFY_TOLERANCE_PX = 6;
const DPIRD_10M_CONTOUR_DRAWING_INFO = {
  renderer: {
    type: "simple",
    symbol: {
      type: "esriSLS",
      style: "esriSLSSolid",
      color: [210, 105, 30, 255],
      width: 1.5,
    },
  },
  scaleSymbols: false,
  transparency: 0,
  labelingInfo: [
    {
      labelExpression: "[ELEVATION]",
      labelPlacement: "esriServerLinePlacementCenterAlong",
      textLayout: "straight",
      deconflictionStrategy: "dynamic",
      allowOverrun: false,
      repeatLabel: false,
      removeDuplicates: "all",
      lineConnection: "minimizeLabels",
      stackLabel: false,
      useCodedValues: true,
      maxScale: 1000,
      minScale: 50000,
      name: "Default",
      priority: 2,
      symbol: {
        type: "esriTS",
        color: [0, 0, 0, 255],
        haloColor: [255, 255, 255, 255],
        haloSize: 2,
        verticalAlignment: "bottom",
        horizontalAlignment: "center",
        rightToLeft: false,
        angle: 0,
        xoffset: 0,
        yoffset: 0,
        font: {
          family: "Arial",
          size: 10,
          style: "normal",
          weight: "normal",
          decoration: "none",
        },
      },
    },
  ],
};
const DPIRD_CONTOUR_LAYER_CONFIGS = [
  {
    key: "contoursDpird072",
    name: "2 Metre Contours (DPIRD-072)",
    layerId: 0,
    interval: 2,
    elevationField: "elevation_m",
    opacity: 0.8,
    priority: 2,
  },
  {
    key: "contoursDpird073",
    name: "10 Metre Contours (DPIRD-073)",
    layerId: 1,
    interval: 10,
    elevationField: "elevation",
    opacity: 0.8,
    priority: 1,
    drawingInfo: DPIRD_10M_CONTOUR_DRAWING_INFO,
  },
];
const LGATE_214_PROJECT_GRID_MAPSERVER =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Imagery_and_Maps/MapServer";
const LGATE_214_PROJECT_GRID_KEY = "projectGrid214";
const LGATE_214_PROJECT_GRID_LAYER_ID = 29;
const LGATE_214_PROJECT_GRID_NAME = "Landgate Project Grids (LGATE-214)";
const LGATE_214_PROJECT_GRID_IDENTIFY_TOLERANCE_PX = 1;
const LGATE_229_DISTRICTS_KEY = "districts229";
const LGATE_229_DISTRICTS_NAME = "Districts (LGATE-229)";
const LGATE_229_DISTRICTS_LAYER_ID = 17;
const LGATE_229_DISTRICTS_NAME_FIELD = "name";
const LGATE_229_DISTRICTS_IDENTIFY_TOLERANCE_PX = 1;
const LGATE_229_DISTRICTS_DRAWING_INFO = {
  renderer: {
    type: "simple",
    symbol: {
      type: "esriSFS",
      style: "esriSFSSolid",
      color: [244, 211, 94, 31],
      outline: {
        type: "esriSLS",
        style: "esriSLSSolid",
        color: [154, 103, 0, 230],
        width: 2,
      },
    },
    label: "District",
  },
  scaleSymbols: true,
  transparency: 0,
  labelingInfo: [
    {
      labelExpression: "[name]",
      labelPlacement: "esriServerPolygonPlacementAlwaysHorizontal",
      removeDuplicates: "none",
      multiPart: "labelPerPart",
      deconflictionStrategy: "dynamic",
      repeatLabel: false,
      allowOverrun: false,
      stackLabel: false,
      useCodedValues: true,
      maxScale: 0,
      minScale: 1500000,
      name: "Default",
      priority: 28,
      symbol: {
        type: "esriTS",
        color: [45, 32, 0, 255],
        haloColor: [255, 255, 255, 255],
        haloSize: 1,
        verticalAlignment: "bottom",
        horizontalAlignment: "center",
        rightToLeft: false,
        angle: 0,
        xoffset: 0,
        yoffset: 0,
        font: {
          family: "Arial",
          size: 9,
          style: "normal",
          weight: "bold",
          decoration: "none",
        },
      },
    },
  ],
};
const MRWA_PROJECT_ZONES_QUERY =
  "https://services2.arcgis.com/cHGEnmsJ165IBJRM/arcgis/rest/services/Project_Zone_View/FeatureServer/0/query";
const MRWA_PROJECT_ZONES_KEY = "mrwaProjectZones";
const MRWA_PROJECT_ZONES_NAME = "MRWA Project Zones";
const MRWA_PROJECT_ZONES_GDA94_SPHEROID = "gda94";
// The portal's MRWA Project Zones layer intentionally shows GDA94 zones only;
// GDA2020 source records are excluded from rendering and identification.
const MRWA_PROJECT_ZONES_WHERE = "Spheroid = 'GDA94'";
const MRWA_ROADS_NETWORK_MAPSERVER =
  "https://gisservices.mainroads.wa.gov.au/arcgis/rest/services/OpenData/RoadAssets_DataPortal/MapServer";
const MRWA_ROADS_NETWORK_KEY = "mrwaRoadsNetwork";
const MRWA_ROADS_NETWORK_LAYER_ID = 17;
const MRWA_ROADS_NETWORK_NAME = "Roads Network";
const MRWA_ROADS_NETWORK_ROAD_NAME_FIELD = "ROAD_NAME";
const MRWA_ROADS_NETWORK_IDENTIFY_TOLERANCE_PX = 6;
const MRWA_RRM_KEY = "mrwaRrms";
const MRWA_RRM_NAME = "MRWA RRMs";
const MRWA_RRM_WHERE = "ControlType = 'RRM'";
const MRWA_RRM_OUT_FIELDS = [
  "OBJECTID",
  "MarkName",
  "ControlType",
  "MarkType",
  "ElevationDatum",
  "Elevation",
  "MGAZone",
  "Easting_MGA94",
  "Northing_MGA94",
  "Easting_MGA2020",
  "Northing_MGA2020",
  "ProjectZone",
  "Easting_PrZone94",
  "Northing_PrZone94",
  "Easting_PrZone2020",
  "Northing_PrZone2020",
  "Comments",
];
const MRWA_RRM_EXPORT_FIELDS = ["OBJECTID", "MarkName", "ControlType"];
const MRWA_RRM_POPUP_ROWS = [
  ["Mark Name", "MarkName"],
  ["Control Type", "ControlType"],
  ["Mark Type", "MarkType"],
  ["Elevation Datum", "ElevationDatum"],
  ["Elevation", "Elevation"],
  ["MGA Zone", "MGAZone"],
  ["MGA94 Easting", "Easting_MGA94"],
  ["MGA94 Northing", "Northing_MGA94"],
  ["MGA2020 Easting", "Easting_MGA2020"],
  ["MGA2020 Northing", "Northing_MGA2020"],
  ["Project Zone", "ProjectZone"],
  ["Project Zone 94 Easting", "Easting_PrZone94"],
  ["Project Zone 94 Northing", "Northing_PrZone94"],
  ["Project Zone 2020 Easting", "Easting_PrZone2020"],
  ["Project Zone 2020 Northing", "Northing_PrZone2020"],
  ["Comments", "Comments"],
];
const MRWA_ROADS_NETWORK_DRAWING_INFO = {
  renderer: {
    type: "uniqueValue",
    field1: "NETWORK_TYPE",
    uniqueValueInfos: [
      {
        value: "State Road",
        label: "State Road",
        symbol: {
          type: "esriSLS",
          style: "esriSLSSolid",
          color: [0, 197, 255, 255],
          width: 2,
        },
      },
      {
        value: "Local Road",
        label: "Local Road",
        symbol: {
          type: "esriSLS",
          style: "esriSLSSolid",
          color: [204, 204, 204, 255],
          width: 2,
        },
      },
      {
        value: "Main Roads Controlled Path",
        label: "Main Roads Controlled Path",
        symbol: {
          type: "esriSLS",
          style: "esriSLSDash",
          color: [197, 0, 255, 255],
          width: 2,
        },
      },
      {
        value: "Miscellaneous Road",
        label: "Miscellaneous Road",
        symbol: {
          type: "esriSLS",
          style: "esriSLSSolid",
          color: [255, 170, 0, 255],
          width: 2,
        },
      },
      {
        value: "Crossover",
        label: "Crossover",
        symbol: {
          type: "esriSLS",
          style: "esriSLSSolid",
          color: [0, 0, 0, 255],
          width: 2,
        },
      },
    ],
    fieldDelimiter: ",",
  },
};

// Info popup sections intentionally follow the Layers panel order.
// Add new information-enabled layers here when they are added to the panel.
const INFO_LAYER_ORDER_IDS = [
  "cad001",
  "ssm076",
  "bm076",
  "rm199",
  "mrwaRrms",
  "projectGrid214",
  "mrwaProjectZones",
  "drainagePits",
  "power034",
  "power031",
  "power029",
  "power035",
  "power032",
  "power030",
  "power051",
  "sewer026",
  "sewer068",
  "sewer083",
  "sewer084",
  "water002",
  "water006",
  "contoursDpird072",
  "contoursDpird073",
  "districts229",
  "lga233",
  "localities234",
  "bushfire001",
  "zoning070",
  "mrwaRoadsNetwork",
];
const INFO_LAYER_ORDER = new Map(
  INFO_LAYER_ORDER_IDS.map((layerId, index) => [layerId, index])
);
function getInfoLayerOrder(layerId) {
  return INFO_LAYER_ORDER.has(layerId) ? INFO_LAYER_ORDER.get(layerId) : Number.MAX_SAFE_INTEGER;
}


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

const mrwaRrmTriangleSymbol = {
  ...ssmTriangleSymbol,
  fillColor: "#66C2FF",
  strokeColor: "#0B4F8A",
  strokeWeight: 1.75,
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
async function fetchArcgisGeojsonInView(url, bounds, where = "1=1", options = {}) {
  if (!bounds) return { type: "FeatureCollection", features: [] };

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const geometry = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;

  const params = new URLSearchParams({
    where,
    outFields: Array.isArray(options.outFields)
      ? options.outFields.join(",")
      : options.outFields || "*",
    f: "geojson",
    outSR: "4326",
    geometry,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    returnGeometry: "true",
    t: Date.now().toString(),
  });

  if (options.geometryPrecision != null) {
    params.set("geometryPrecision", String(options.geometryPrecision));
  }
  if (options.maxAllowableOffset != null) {
    params.set("maxAllowableOffset", String(options.maxAllowableOffset));
  }

  if (!options.paginate) {
    const requestUrl = `${url}?${params.toString()}`;
    const res = await fetch(requestUrl);
    const json = await res.json();

    if (json?.error) throw new Error(json.error.message || "ArcGIS query error");

    return { type: "FeatureCollection", features: json?.features || [], requestUrl };
  }

  const pageSize = Math.max(1, Number(options.pageSize) || 2000);
  const features = [];
  let requestUrl = "";

  for (let offset = 0; offset < pageSize * 50; offset += pageSize) {
    params.set("resultOffset", String(offset));
    params.set("resultRecordCount", String(pageSize));
    params.set("orderByFields", options.orderByFields || "OBJECTID");
    requestUrl = `${url}?${params.toString()}`;

    const res = await fetch(requestUrl);
    const json = await res.json();

    if (json?.error) throw new Error(json.error.message || "ArcGIS query error");

    const pageFeatures = json?.features || [];
    features.push(...pageFeatures);

    const exceededTransferLimit =
      !!json?.properties?.exceededTransferLimit || !!json?.exceededTransferLimit;
    if (!exceededTransferLimit && pageFeatures.length < pageSize) break;
  }

  return { type: "FeatureCollection", features, requestUrl };
}

function getMapImageSize(mapDiv) {
  const width = Math.max(1, Math.round(mapDiv?.clientWidth || mapDiv?.offsetWidth || 1));
  const height = Math.max(1, Math.round(mapDiv?.clientHeight || mapDiv?.offsetHeight || 1));
  return { width, height };
}

function buildArcgisMapServerExportUrl({ serviceUrl, bounds, width, height, layerId, drawingInfo }) {
  if (!serviceUrl || !bounds || !width || !height) return "";

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const bbox = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
  const params = new URLSearchParams({
    f: "image",
    format: "png32",
    transparent: "true",
    bbox,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${width},${height}`,
    dpi: "96",
  });

  if (drawingInfo) {
    params.set(
      "dynamicLayers",
      JSON.stringify([
        {
          id: layerId,
          source: { type: "mapLayer", mapLayerId: layerId },
          drawingInfo,
        },
      ])
    );
  } else {
    params.set("layers", `show:${layerId}`);
  }

  return `${serviceUrl}/export?${params.toString()}`;
}

function formatContourElevation(value) {
  const text = cleanInfoPart(value);
  if (!text) return "";
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  return number.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function getContourElevationFromAttributes(attrs = {}, field) {
  const wanted = String(field || "").toLowerCase();
  const fieldName = Object.keys(attrs).find((key) => key.toLowerCase() === wanted);
  if (!fieldName) return { fieldName: "", value: "" };
  return { fieldName, value: attrs[fieldName] };
}

function getContourConfigForIdentifyResult(result, contourConfigs) {
  const attrs = result?.attributes || {};
  const resultLayerId = Number(result?.layerId);

  return contourConfigs.find((config) => {
    if (Number.isFinite(resultLayerId) && resultLayerId === config.layerId) return true;
    const layerName = String(result?.layerName || "").toLowerCase();
    if (layerName && layerName.includes(String(config.interval))) return true;
    return !!getContourElevationFromAttributes(attrs, config.elevationField).fieldName;
  });
}

async function identifyDpirdContours({ serviceUrl, latLng, map, mapDiv, tolerance, contourConfigs }) {
  if (!serviceUrl || !latLng || !map || !mapDiv || !contourConfigs?.length) return [];

  const bounds = map.getBounds();
  if (!bounds) return [];

  const { width, height } = getMapImageSize(mapDiv);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
  const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const orderedConfigs = [...contourConfigs].sort(
    (a, b) => getInfoLayerOrder(a.key) - getInfoLayerOrder(b.key)
  );
  const spatialReference = { wkid: 4326 };
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    mapExtent: JSON.stringify({
      xmin: sw.lng(),
      ymin: sw.lat(),
      xmax: ne.lng(),
      ymax: ne.lat(),
      spatialReference,
    }),
    imageDisplay: `${width},${height},96`,
    tolerance: String(tolerance),
    layers: `visible:${orderedConfigs.map((config) => config.layerId).join(",")}`,
    returnGeometry: "false",
  });

  const res = await fetch(`${serviceUrl}/identify?${params.toString()}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message || "ArcGIS identify error");

  const contours = [];
  for (const config of orderedConfigs) {
    const result = (json?.results || []).find((item) => {
      const matchedConfig = getContourConfigForIdentifyResult(item, [config]);
      if (!matchedConfig) return false;
      return !!getContourElevationFromAttributes(item?.attributes || {}, config.elevationField).fieldName;
    });
    if (!result) continue;

    const elevation = getContourElevationFromAttributes(result.attributes || {}, config.elevationField);
    const formattedElevation = formatContourElevation(elevation.value);
    if (!formattedElevation) continue;

    contours.push({
      elevation: formattedElevation,
      elevationField: elevation.fieldName,
      interval: config.interval,
      layerId: config.layerId,
      layerKey: config.key,
    });
  }

  return contours;
}

function getCaseInsensitiveAttribute(attrs = {}, field) {
  const wanted = String(field || "").toLowerCase();
  const key = Object.keys(attrs).find((name) => name.toLowerCase() === wanted);
  return key ? cleanInfoPart(attrs[key]) : "";
}

function isMrwaGda94ProjectZone(attributes = {}) {
  return (
    getCaseInsensitiveAttribute(attributes, "Spheroid").toLowerCase() ===
    MRWA_PROJECT_ZONES_GDA94_SPHEROID
  );
}

function isRenderableMrwaProjectZoneFeature(feature) {
  return isMrwaGda94ProjectZone(feature?.properties || {});
}

async function identifyProjectGrid214({ serviceUrl, latLng, map, mapDiv, tolerance }) {
  if (!serviceUrl || !latLng || !map || !mapDiv) return [];

  const bounds = map.getBounds();
  if (!bounds) return [];

  const { width, height } = getMapImageSize(mapDiv);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
  const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const spatialReference = { wkid: 4326 };
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    mapExtent: JSON.stringify({
      xmin: sw.lng(),
      ymin: sw.lat(),
      xmax: ne.lng(),
      ymax: ne.lat(),
      spatialReference,
    }),
    imageDisplay: `${width},${height},96`,
    tolerance: String(tolerance),
    layers: `visible:${LGATE_214_PROJECT_GRID_LAYER_ID}`,
    returnGeometry: "false",
  });

  const res = await fetch(`${serviceUrl}/identify?${params.toString()}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message || "ArcGIS identify error");

  const seen = new Set();
  const grids = [];
  (json?.results || []).forEach((result) => {
    const attrs = result?.attributes || {};
    const projection = getCaseInsensitiveAttribute(attrs, "projection");
    const projId = getCaseInsensitiveAttribute(attrs, "proj_id");
    if (!projection && !projId) return;

    const key = `${projection.toLowerCase()}::${projId.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    grids.push({ projection, projId });
  });

  return grids;
}

async function identifyMrwaRoadsNetwork({ serviceUrl, latLng, map, mapDiv, tolerance }) {
  if (!serviceUrl || !latLng || !map || !mapDiv) return [];

  const bounds = map.getBounds();
  if (!bounds) return [];

  const { width, height } = getMapImageSize(mapDiv);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
  const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const spatialReference = { wkid: 4326 };
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    mapExtent: JSON.stringify({
      xmin: sw.lng(),
      ymin: sw.lat(),
      xmax: ne.lng(),
      ymax: ne.lat(),
      spatialReference,
    }),
    imageDisplay: `${width},${height},96`,
    tolerance: String(tolerance),
    layers: `visible:${MRWA_ROADS_NETWORK_LAYER_ID}`,
    returnGeometry: "false",
  });

  const res = await fetch(`${serviceUrl}/identify?${params.toString()}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message || "ArcGIS identify error");

  const seen = new Set();
  const roadNames = [];
  (json?.results || []).forEach((result) => {
    const roadName = getCaseInsensitiveAttribute(
      result?.attributes || {},
      MRWA_ROADS_NETWORK_ROAD_NAME_FIELD
    );
    if (!roadName) return;

    const key = roadName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    roadNames.push(roadName);
  });

  return roadNames;
}

async function identifyLandgateDistricts({ serviceUrl, latLng, map, mapDiv, tolerance }) {
  if (!serviceUrl || !latLng || !map || !mapDiv) return [];

  const bounds = map.getBounds();
  if (!bounds) return [];

  const { width, height } = getMapImageSize(mapDiv);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
  const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const spatialReference = { wkid: 4326 };
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    mapExtent: JSON.stringify({
      xmin: sw.lng(),
      ymin: sw.lat(),
      xmax: ne.lng(),
      ymax: ne.lat(),
      spatialReference,
    }),
    imageDisplay: `${width},${height},96`,
    tolerance: String(tolerance),
    layers: `visible:${LGATE_229_DISTRICTS_LAYER_ID}`,
    returnGeometry: "false",
  });

  const res = await fetch(`${serviceUrl}/identify?${params.toString()}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message || "ArcGIS identify error");

  const seen = new Set();
  const districtNames = [];
  (json?.results || []).forEach((result) => {
    const districtName = getCaseInsensitiveAttribute(
      result?.attributes || {},
      LGATE_229_DISTRICTS_NAME_FIELD
    );
    if (!districtName) return;

    const key = districtName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    districtNames.push(districtName);
  });

  return districtNames;
}

function cleanInfoPart(value) {
  const text = String(value ?? "").trim();
  if (!text || /^null$/i.test(text) || /^undefined$/i.test(text)) return "";
  return text.replace(/\s+/g, " ");
}

function formatLgate002RoadNumber(attrs = {}) {
  const first = cleanInfoPart(attrs.road_number_1);
  const second = cleanInfoPart(attrs.road_number_2);
  if (first && second && first !== second) return `${first}-${second}`;
  return first || second;
}

function formatLgate002Address(attrs = {}) {
  const roadNumber = formatLgate002RoadNumber(attrs);
  const roadName = cleanInfoPart(attrs.road_name);
  const roadType = cleanInfoPart(attrs.road_type);
  const roadSuffix = cleanInfoPart(attrs.road_suffix);
  const locality = cleanInfoPart(attrs.locality);

  const streetLine = [roadNumber, roadName, roadType, roadSuffix].filter(Boolean).join(" ");
  const localityLine = [locality, locality ? "WA" : ""].filter(Boolean).join(" ");

  return [streetLine, localityLine].filter(Boolean).join("\n");
}

function getCadastreValue(props = {}, keys = []) {
  for (const key of keys) {
    const direct = cleanInfoPart(props[key]);
    if (direct) return direct;

    const foundKey = Object.keys(props).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (foundKey) {
      const value = cleanInfoPart(props[foundKey]);
      if (value) return value;
    }
  }

  const matcher = keys.some((key) => key.toLowerCase().includes("lot"))
    ? "lot"
    : keys.some((key) => key.toLowerCase().includes("plan") || key.toLowerCase().includes("diagram"))
    ? "plan"
    : "";

  if (matcher) {
    const foundKey = Object.keys(props).find((candidate) => {
      const key = candidate.toLowerCase();
      if (key.includes("objectid") || key === "fid" || key.includes("feature")) return false;
      return key.includes(matcher);
    });
    if (foundKey) {
      const value = cleanInfoPart(props[foundKey]);
      if (value) return value;
    }
  }

  return "";
}

function buildCadastreLotPlanRowsFromProps(props = {}, existingRows = []) {
  const existingText = existingRows.join(" ").toLowerCase();
  const rows = [];

  if (!existingText.includes("lot")) {
    const lot = getCadastreValue(props, [
      "lot_number",
      "lot_no",
      "lot",
      "lotnumber",
      "lot_num",
      "parcel_lot_number",
    ]);
    if (lot) {
      rows.push(`
        <div style="margin-top:5px; color:#111; word-break:break-word;">
          <span style="font-weight:900; color:#333;">Lot:</span> ${escapeHtml(lot)}
        </div>
      `);
    }
  }

  if (!existingText.includes("plan")) {
    const plan = getCadastreValue(props, [
      "plan_number",
      "plan_no",
      "plan",
      "plannumber",
      "survey_plan",
      "survey_plan_number",
      "document_number",
      "diagram_number",
    ]);
    if (plan) {
      rows.push(`
        <div style="margin-top:5px; color:#111; word-break:break-word;">
          <span style="font-weight:900; color:#333;">Plan:</span> ${escapeHtml(plan)}
        </div>
      `);
    }
  }

  return rows;
}

async function fetchLgate002AddressAtLatLng(latLng) {
  if (!latLng) return { address: "", lotNumber: "" };

  const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { address: "", lotNumber: "" };
  }

  const queryLayer = async (url) => {
    const params = new URLSearchParams({
      f: "json",
      where: "1=1",
      outFields: "lot_number,road_number_1,road_number_2,road_name,road_type,road_suffix,locality",
      returnGeometry: "false",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outSR: "4326",
      resultRecordCount: "1",
    });

    const response = await fetch(`${url}?${params.toString()}`);
    const json = await response.json();
    if (json?.error) throw new Error(json.error.message || "LGATE-002 query error");
    return json?.features?.[0]?.attributes || null;
  };

  try {
    const attrs =
      (await queryLayer(LGATE_002_ADDRESS_LARGE_QUERY)) ||
      (await queryLayer(LGATE_002_ADDRESS_SMALL_QUERY));

    if (!attrs) return { address: "", lotNumber: "" };

    return {
      address: formatLgate002Address(attrs),
      lotNumber: cleanInfoPart(attrs.lot_number),
    };
  } catch (err) {
    console.warn("LGATE-002 address query failed:", err);
    return { address: "", lotNumber: "" };
  }
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
    allVals.includes("NOT LOCATED") ||
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

function hasPopupValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatReadableDate(value) {
  if (!hasPopupValue(value)) return "";

  const raw = String(value).trim();
  const numeric = Number(raw);
  const date =
    Number.isFinite(numeric) && raw.length >= 10
      ? new Date(numeric)
      : new Date(raw);

  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildPopupRowsForExample(props = {}, nameOverride, layerTag = "", options = {}) {
  const pointName =
    nameOverride ||
    props.geodetic_point_name ||
    props.reference_mark_name ||
    props.geodetic_point_pid ||
    "";

  const vertDatum = firstProp(props, ["vert_datum", "vertical_datum"]);
  const rl = firstProp(props, ["reduced_level", "reducedlevel", "height"]);
  const vertAccuracy = firstProp(props, ["vert_accuracy"]);

  const mgaZone = firstProp(props, ["mga2020_zone", "zone"]);
  const mgaE = firstProp(props, ["mga2020_easting", "easting"]);
  const mgaN = firstProp(props, ["mga2020_northing", "northing"]);

  const rows = [
    ["GEODETIC POINT NAME", pretty(pointName, 0)],
    ["VERT DATUM", pretty(vertDatum, 0)],
    ["REDUCED LEVEL (m)", pretty(rl, 3)],
    ["Vertical accuracy", pretty(vertAccuracy, 4)],
    ["MGA2020 ZONE", pretty(mgaZone, 0)],
    ["MGA2020 EASTING (m)", pretty(mgaE, 3)],
    ["MGA2020 NORTHING (m)", pretty(mgaN, 3)],
  ];

  if (options?.pcg2020) {
    rows.push(
      ["PCG2020 EASTING (m)", pretty(options.pcg2020.easting, 3)],
      ["PCG2020 NORTHING (m)", pretty(options.pcg2020.northing, 3)]
    );
  }

  if (layerTag === "SSM" || layerTag === "BM") {
    const horizAccuracy = firstProp(props, ["horiz_accuracy"]);
    const latestStatusDate = firstProp(props, ["latest_status_date"]);
    const latestStatusDescription = firstProp(props, ["latest_status_description"]);

    rows.push(
      ["Relative horizontal accuracy", pretty(horizAccuracy, 4)],
      ["Physical status date", formatReadableDate(latestStatusDate)],
      ["Physical status", pretty(latestStatusDescription, 0)]
    );
  }

  return rows.filter(([, v]) => hasPopupValue(v));
}

function buildPopupHtmlExample({ layerTag, name, props, pcg2020 }) {
  const rows = buildPopupRowsForExample(props, name, layerTag, { pcg2020 });
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
        <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildLatLngSearchUrl(
          props.lat ?? props.latitude ?? "",
          props.lng ?? props.longitude ?? ""
        )}" target="_blank" rel="noreferrer"
           style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                  border:1px solid #ccc; color:#111; background:#fff; font-weight:700; font-size:12px;">
          🔍 Open in Google Maps
        </a>
        <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildDirectionsUrl(
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

function isMrwaRrmFeature(feature) {
  const controlType = cleanInfoPart(feature?.properties?.ControlType);
  return controlType.toUpperCase() === "RRM";
}

function formatPopupValueOrDash(value) {
  if (typeof value === "number" && !Number.isFinite(value)) return "—";
  const text = String(value ?? "").trim();
  if (!text) return "—";
  if (/^(null|undefined|n\/a|none)$/i.test(text)) return "—";
  return text;
}

function buildDrainagePitPopupHtml({ features = null, props = null } = {}) {
  const items = Array.isArray(features) && features.length ? features : [props || {}];
  const deduped = [];
  const seen = new Set();

  items.forEach((item, index) => {
    const source = item?.properties || item || {};
    const key = cleanInfoPart(source.OBJECTID) || cleanInfoPart(source.objectid) || String(index);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(source);
  });

  const rows = deduped.length ? deduped : [{}];

  return `
    <div style="font-family: Inter, sans-serif; font-size: 13px; min-width: 220px;">
      <div data-pw-drag-handle="1" style="font-weight:800; font-size:14px; margin-bottom:8px; color:#111;">
        ${rows.length === 1 ? "DRAINAGE PIT" : "DRAINAGE PITS"}
      </div>

      ${rows
        .map((row, index) => `
        <div style="${index ? "margin-top:8px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);" : ""}">
          <div style="padding:2px 0;">
            <span style="font-weight:700; color:#333;">Pit Type:</span>
            <span style="color:#111; word-break:break-word; overflow-wrap:anywhere;">${escapeHtml(formatPopupValueOrDash(row.Pit_Type))}</span>
          </div>
        </div>`)
        .join("")}
    </div>
  `;
}
function buildMrwaRrmPopupHtml({ props = {}, multiple = false }) {
  return `
    <div style="font-family: Inter, sans-serif; font-size: 13px; min-width: 250px;">
      <div data-pw-drag-handle="1" style="font-weight:800; font-size:14px; margin-bottom:8px; color:#111;">
        ${multiple ? "MRWA RRMs" : "MRWA RRM"}
      </div>

      ${MRWA_RRM_POPUP_ROWS.map(([label, field]) => {
        const value = formatPopupValueOrDash(props[field]);
        return `
        <div style="padding:2px 0;">
          <div style="font-weight:700; color:#333;">${escapeHtml(label)}</div>
          <div style="color:#111; word-break:break-word; overflow-wrap:anywhere;">${escapeHtml(value)}</div>
        </div>`;
      }).join("")}
    </div>
  `;
}

function hasMga2020PopupCoords(props = {}) {
  return (
    hasPopupValue(firstProp(props, ["mga2020_zone", "zone"])) &&
    hasPopupValue(firstProp(props, ["mga2020_easting", "easting"])) &&
    hasPopupValue(firstProp(props, ["mga2020_northing", "northing"]))
  );
}

function isGeodeticPopupLayer(layerTag) {
  return ["SSM", "BM", "RM"].includes(String(layerTag || "").toUpperCase());
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
  const addressAutocompleteInputRef = useRef(null);
  const addressAutocompleteListenerRef = useRef(null);
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
  const [googleMapsReady, setGoogleMapsReady] = useState(
    () => typeof window !== "undefined" && !!window.google?.maps
  );

  const toolsControlDivRef = useRef(null);
  const idleDebounceRef = useRef(null);
  const viewRef = useRef({ bounds: null, zoom: null });
  const mapRuntimeListenersRef = useRef([]);

useEffect(() => {
  layersRef.current = layers;
}, [layers]);

useEffect(() => {
  if (typeof window === "undefined") return undefined;
  if (window.google?.maps) {
    setGoogleMapsReady(true);
    return undefined;
  }

  let cancelled = false;
  let pollId = null;
  const mapsScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');

  const markReady = () => {
    if (!cancelled && window.google?.maps) {
      setGoogleMapsReady(true);
      if (pollId) window.clearInterval(pollId);
    }
  };

  mapsScript?.addEventListener("load", markReady);
  pollId = window.setInterval(markReady, 250);
  markReady();

  return () => {
    cancelled = true;
    mapsScript?.removeEventListener("load", markReady);
    if (pollId) window.clearInterval(pollId);
  };
}, []);

  // Fetch throttles + caches
const lastFetchRef = useRef({
  ssm076: 0,
  bm076: 0,
  rm199: 0,
  mrwaRrms: 0,
  cad001: 0,
  lga233: 0,
  localities234: 0,
  zoning070: 0,
  sewer068: 0,
  sewer026: 0,
  drainagePits: 0,
  drainagePipes: 0,
  sewer084: 0,
  sewer083: 0,
  water002: 0,
  water006: 0,
});

  const clustererRef = useRef(null);

   // Polygon layers (cadastre, LGA, zoning, future planning layers)
  const polygonLayersRef = useRef(new Map());
  const lgate002AddressCacheRef = useRef(new Map());

  // Point layers (SSM, BM, RM, future point layers)
const pointLayersRef = useRef(new Map());

// Line layers (future road centreline / contours / etc.)
const lineLayersRef = useRef(new Map());
const contourOverlaysRef = useRef(new Map());
const projectGridOverlayRef = useRef(null);
const districtsOverlayRef = useRef(null);
const roadsNetworkOverlayRef = useRef(null);
const contourIdentifySeqRef = useRef(0);

  // Portal jobs markers/cluster
  const portalClustererRef = useRef(null);
  const portalMarkersByIdRef = useRef(new Map());
  const portalJobsByIdRef = useRef(new Map());
  const portalPointsByIdRef = useRef(new Map());
  const portalVisibleIdsRef = useRef(new Set());

  // Notes markers + info windows
  const noteMarkersByIdRef = useRef(new Map());
  const noteInfoWindowRef = useRef(null);
  const openNoteInfoRef = useRef(null);
  const activeNoteInfoIdRef = useRef(null);
  const noteComposerIWRef = useRef(null);
  const pointInfoWindowRef = useRef(null);
  const lastMapTapRef = useRef({ at: 0, lat: null, lng: null });
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
  const geodeticPcg2020CacheRef = useRef(new Map());

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
  const [exportDialogPosition, setExportDialogPosition] = useState(null);
  const [exportDialogDragging, setExportDialogDragging] = useState(false);

  const exportListenersRef = useRef([]);
  const exportFenceRef = useRef(null);      // rectangle or polygon overlay
  const exportPathRef = useRef([]);         // polygon path points
  const exportGeometryRef = useRef(null);   // cached geometry for ArcGIS query
  const exportDialogRef = useRef(null);
  const exportDialogDragRef = useRef(null);

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
  const noteAddModeRef = useRef(false);
  const [notesSyncError, setNotesSyncError] = useState("");

  useEffect(() => {
    noteAddModeRef.current = noteAddMode;
  }, [noteAddMode]);

  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(() => {
    const s = safeReadState() || {};
    if (s.notesVisibility && typeof s.notesVisibility.showAllNotes === "boolean") {
      return s.notesVisibility.showAllNotes;
    }
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
    if (!exportDialogOpen || isMobile || !exportDialogPosition) return;

    const onResize = () => {
      setExportDialogPosition((pos) =>
        pos ? clampExportDialogPosition(pos.left, pos.top) : pos
      );
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [exportDialogOpen, exportDialogPosition, isMobile]);

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

  const stopLocationTracking = useCallback(() => {
    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
    setIsFollowingLocation(false);
  }, []);

  const pauseMapActivity = useCallback(() => {
    stopLocationTracking();

    if (idleDebounceRef.current) {
      clearTimeout(idleDebounceRef.current);
      idleDebounceRef.current = null;
    }

    try {
      hoverInfoWindowRef.current?.close();
    } catch {
      // ignore
    }
  }, [stopLocationTracking]);

  const openExternalNav = useCallback(
    (url) => {
      if (!url) return;
      pauseMapActivity();

      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.href = url;
      }
    },
    [pauseMapActivity]
  );

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
  if (!showAllNotes && !portalSelectedJobId) {
    setNotesSyncError("");
    return;
  }

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
}, [isAppVisible, portalSelectedJobId, showAllNotes]);

// Persist UI state
  useEffect(() => {
    safeWriteState({
      jobNumberQuery,
      jobPicked,
      activeTab,
      panelOpen,
      showAllPortalJobs,
      portalSelectedJobId,
    });
  }, [jobNumberQuery, jobPicked, activeTab, panelOpen, showAllPortalJobs, portalSelectedJobId]);

  const handleShowAllNotesChange = useCallback((checked) => {
    setShowAllNotes(checked);
    safeWriteState({
      showAllNotes: checked,
      notesVisibility: { showAllNotes: checked },
    });
  }, []);

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
        openNoteInfoRef.current?.(n.id, { source: "marker" });
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
    const confirmed = window.confirm(
      "Are you sure you want to delete this note? This action cannot be undone."
    );
    if (!confirmed) return;

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
      if (activeNoteInfoIdRef.current === id) activeNoteInfoIdRef.current = null;
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

    activeNoteInfoIdRef.current = id;

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
          <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildLatLngSearchUrl(note.lat, note.lng)}"
             target="_blank" rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:10px;
                    border:2px solid #111; color:#111; background:#fff; font-weight:900; font-size:12px;">
            📍 Go To
          </a>
          <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildDirectionsUrl(note.lat, note.lng)}"
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
  openNoteInfoRef.current = openNoteInfo;

  const canOpenTemporaryPointPopup = () =>
    !noteAddModeRef.current &&
    !measureModeRef.current &&
    !exportModeRef.current &&
    !infoModeRef.current;

  const openTemporaryPointInfo = (latLng) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !pointInfoWindowRef.current || !latLng) return;
    if (!canOpenTemporaryPointPopup()) return;

    const lat = typeof latLng.lat === "function" ? latLng.lat() : Number(latLng.lat);
    const lng = typeof latLng.lng === "function" ? latLng.lng() : Number(latLng.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const mga = wgs84ToMga2020(lat, lng);
    const mgaLine = mga
      ? `MGA2020 (Zone ${mga.zone}) — E ${fmtMGA(mga.easting)}  N ${fmtMGA(mga.northing)}`
      : "";
    const position = { lat, lng };

    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; font-size: 12px; min-width: 220px;">
        <div data-pw-drag-handle="1" style="display:flex; justify-content:space-between; align-items:center; gap:10px;"></div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button id="point-goto"
            style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:10px;
                   border:2px solid #111; color:#111; background:#fff; font-weight:900; font-size:12px; cursor:pointer;">
            📍 Go To
          </button>
          <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildDirectionsUrl(lat, lng)}"
             rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:10px;
                    border:2px solid #111; color:#fff; background:#111; font-weight:900; font-size:12px;">
            🚗 Directions
          </a>
        </div>
        ${mgaLine ? `<div style="margin-top:8px; font-size:11px; color:#444; font-weight:800;">${mgaLine}</div>` : ""}
      </div>
    `;

    pointInfoWindowRef.current.setContent(html);
    pointInfoWindowRef.current.setPosition(position);
    pointInfoWindowRef.current.open({ map });

    window.google.maps.event.addListenerOnce(pointInfoWindowRef.current, "domready", () => {
      setTimeout(makeLatestInfoWindowDraggable, 0);
      const goToBtn = document.getElementById("point-goto");
      if (goToBtn) {
        goToBtn.onclick = () => {
          const z = map.getZoom() || 16;
          map.panTo(position);
          map.setZoom(Math.max(z, 18));
        };
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

  useEffect(() => {
    const id = activeNoteInfoIdRef.current;
    if (!id || !noteInfoWindowRef.current?.getMap?.()) return;
    if (!(mapNotesRef.current || []).some((n) => n.id === id)) return;
    openNoteInfo(id, { zoom: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentUserName, currentUserIsAdmin, mapNotes]);


// ✅ Suggestions: job_number/client name, including jobs without coordinates/address
 const jobNumberSuggestions = useMemo(() => {
  const q = String(jobNumberQuery || "").trim();
  if (!q) return [];
  const needle = q.toLowerCase();

  const results = [];

  for (const j of portalJobs || []) {
    const haystack = [j.job_number, j.client_name].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(needle)) {
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
    if (!googleMapsReady || !window.google?.maps || !mapDivRef.current || mapRef.current) return;

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
  disableDoubleClickZoom: true,
  tilt: 0,
});

    mapRef.current = map;
    map.setTilt(0);

    const tiltListener = map.addListener("tilt_changed", () => {
  if (map.getTilt() !== 0) {
    map.setTilt(0);
  }
});
infoWindowRef.current = new window.google.maps.InfoWindow({
  maxWidth: isSmallScreen() ? 260 : 340,
  disableAutoPan: true,
});

const infoCloseListener = window.google.maps.event.addListener(infoWindowRef.current, "closeclick", () => {
  mainInfoOpenRef.current = false;
  activeMainInfoKeyRef.current = null;
  activeMainInfoLayerRef.current = null;
});
    hoverInfoWindowRef.current = new window.google.maps.InfoWindow({
      disableAutoPan: true,
    });
    noteInfoWindowRef.current = new window.google.maps.InfoWindow();
    const noteCloseListener = window.google.maps.event.addListener(noteInfoWindowRef.current, "closeclick", () => {
      activeNoteInfoIdRef.current = null;
    });
    noteComposerIWRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });
    addressInfoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });
    pointInfoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 280 });

    // ✅ Render saved notes immediately
    try {
      syncNoteMarkers(visibleNotes);
    } catch {
      // ignore
    }

    const mapClickListener = map.addListener("click", (e) => {
      if (mobile && e?.latLng && canOpenTemporaryPointPopup()) {
        const now = Date.now();
        const last = lastMapTapRef.current || {};
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        const samePoint =
          Number.isFinite(last.lat) &&
          Number.isFinite(last.lng) &&
          Math.abs(lat - last.lat) < 0.00008 &&
          Math.abs(lng - last.lng) < 0.00008;

        if (now - (last.at || 0) < 350 && samePoint) {
          lastMapTapRef.current = { at: 0, lat: null, lng: null };
          openTemporaryPointInfo(e.latLng);
          return;
        }

        lastMapTapRef.current = { at: now, lat, lng };
      }

      if (!infoModeRef.current) return;
      if (!e?.latLng) return;

      openMapInfoPopupAtLatLng(e.latLng);
    });

    const mapDblClickListener = map.addListener("dblclick", (e) => {
      if (!e?.latLng) return;
      openTemporaryPointInfo(e.latLng);
    });
 
    // Persist view/type on idle + tick
const idleListener = map.addListener("idle", () => {
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
mapRuntimeListenersRef.current = [
  tiltListener,
  infoCloseListener,
  noteCloseListener,
  mapClickListener,
  mapDblClickListener,
  idleListener,
];
return () => {
  contourIdentifySeqRef.current += 1;
  mapRuntimeListenersRef.current.forEach((listener) => {
    try {
      window.google?.maps?.event?.removeListener(listener);
    } catch {
      // ignore
    }
  });
  mapRuntimeListenersRef.current = [];
  if (idleDebounceRef.current) {
    clearTimeout(idleDebounceRef.current);
    idleDebounceRef.current = null;
  }
};
  }, [googleMapsReady]);
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


  const attachAddressAutocomplete = useCallback((force = false) => {
    const map = mapRef.current;
    if (!map || activeTab !== "jobLayers") return;

    const input = addressInputRef.current;
    if (!input) return;

    if (!window.google?.maps?.places?.Autocomplete) return;

    if (!force && addressAutocompleteRef.current && addressAutocompleteInputRef.current === input) {
      return;
    }

    if (addressAutocompleteListenerRef.current) {
      try {
        window.google?.maps?.event?.removeListener(addressAutocompleteListenerRef.current);
      } catch {
        // ignore
      }
    }
    addressAutocompleteRef.current = null;
    addressAutocompleteInputRef.current = null;
    addressAutocompleteListenerRef.current = null;

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

    const placeChangedListener = autocomplete.addListener("place_changed", () => {
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
    addressAutocompleteInputRef.current = input;
    addressAutocompleteListenerRef.current = placeChangedListener;
  }, [activeTab]);

  // ✅ FIX: attach Places Autocomplete whenever the Job Layers tab is visible (input exists)
  useEffect(() => {
    attachAddressAutocomplete();
  }, [attachAddressAutocomplete, googleMapsReady]);

  useEffect(() => {
    return () => {
      if (addressAutocompleteListenerRef.current) {
        try {
          window.google?.maps?.event?.removeListener(addressAutocompleteListenerRef.current);
        } catch {
          // ignore
        }
      }
      addressAutocompleteRef.current = null;
      addressAutocompleteInputRef.current = null;
      addressAutocompleteListenerRef.current = null;
    };
  }, []);

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
  "id, job_number, client_name, status, full_address, street_number, street_name, suburb, local_authority, job_type_legacy, assigned_to, mga_zone, mga_easting, mga_northing, place_id"
)
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
  const displayAddress = cleanDisplayAddress(addressString) || "—";

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; font-size: 13px; min-width: 250px;">
      <div data-pw-drag-handle="1" style="font-weight:900; font-size:14px; margin-bottom:6px; color:#111;">
        Address
      </div>
      <div style="color:#111; margin-top:6px;">${displayAddress}</div>

      <div style="display:flex; gap:8px; margin-top:10px;">
        <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildSearchUrl(addressString)}" target="_blank" rel="noreferrer"
           style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                  border:1px solid #ccc; color:#111; background:#fff; font-weight:900; font-size:12px;">
          🔍 Maps
        </a>
        <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildDirectionsUrl(position.lat, position.lng)}" rel="noreferrer"
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

function buildMapInfoPopupHtml(
  latLng,
  lgate002Info = null,
  contourInfos = [],
  projectGridInfo = [],
  districtInfo = [],
  roadsNetworkInfo = []
) {
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
  const addSection = (layerId, html) => {
    if (!html) return;
    sections.push({ layerId, order: getInfoLayerOrder(layerId), html });
  };

  const contourList = Array.isArray(contourInfos)
    ? contourInfos
    : contourInfos
    ? [contourInfos]
    : [];

  contourList.forEach((contourInfo) => {
    if (!contourInfo?.elevation) return;
    addSection(
      contourInfo.layerKey,
      `
        <div style="margin-top:8px;">
          <div style="font-weight:950; font-size:13px; color:#111;">
            CONTOUR
          </div>
          ${contourInfo.interval === 10 ? `
            <div style="margin-top:5px; color:#111; word-break:break-word;">
              <span style="font-weight:900; color:#333;">Interval:</span> 10 m
            </div>
          ` : ""}
          <div style="margin-top:5px; color:#111; word-break:break-word;">
            <span style="font-weight:900; color:#333;">Elevation:</span> ${escapeHtml(contourInfo.elevation)} m
          </div>
        </div>
      `
    );
  });

  visiblePolygonLayers.forEach((layer) => {
    const store = polygonLayersRef.current.get(layer.id);
    if (!store?.polygons) return;

    if (layer.id === MRWA_PROJECT_ZONES_KEY) {
      const seenZones = new Set();
      const matchedZones = [];

      store.polygons.forEach((feature) => {
        if (!dataPolygonFeatureContainsLatLng(feature, latLng, googleMaps)) return;

        const props = {};
        feature.forEachProperty((value, key) => {
          props[key] = value;
        });

        const objectId = getCaseInsensitiveAttribute(props, "OBJECTID");
        const name = getCaseInsensitiveAttribute(props, "Name");
        if (!name || !isMrwaGda94ProjectZone(props)) return;

        const dedupeKey = objectId || name.toLowerCase();
        if (seenZones.has(dedupeKey)) return;
        seenZones.add(dedupeKey);
        matchedZones.push({ name });
      });

      if (!matchedZones.length) return;

      addSection(
        layer.id,
        `
          <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);">
            <div style="font-weight:950; font-size:13px; color:#111;">
              ${matchedZones.length === 1 ? "MRWA PROJECT ZONE" : "MRWA PROJECT ZONES"}
            </div>
            ${matchedZones
              .map((zone, index) => `
                <div style="${index ? "margin-top:8px;" : "margin-top:5px;"} color:#111; word-break:break-word;">
                  <div><span style="font-weight:900; color:#333;">Project Zone:</span> ${escapeHtml(zone.name)}</div>
                </div>
              `)
              .join("")}
          </div>
        `
      );
      return;
    }

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

    const lgate002LotRow =
      layer.id === "cad001" && cleanInfoPart(lgate002Info?.lotNumber)
        ? `
          <div style="margin-top:5px; color:#111; word-break:break-word;">
            <span style="font-weight:900; color:#333;">Lot:</span> ${escapeHtml(cleanInfoPart(lgate002Info.lotNumber))}
          </div>
        `
        : "";
    const cadastreRows =
      layer.id === "cad001" && !lgate002LotRow ? buildCadastreLotPlanRowsFromProps(props, rows) : [];
    const addressRow =
      layer.id === "cad001" && lgate002Info
        ? `
          <div style="margin-top:5px; color:#111; white-space:pre-line; word-break:break-word;">
            <span style="font-weight:900; color:#333;">Address:</span> ${escapeHtml(lgate002Info.address || "No registered address")}
          </div>
        `
        : "";
    const visibleRows = layer.id === "cad001" ? `${lgate002LotRow}${cadastreRows.join("")}${addressRow}` : rows.join("");
    const sectionStyle =
      layer.id === "cad001"
        ? "margin-top:8px;"
        : "margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);";

    addSection(
      layer.id,
      `
        <div style="${sectionStyle}">
          <div style="font-weight:950; font-size:13px; color:#111;">
            ${layer.id === "cad001" ? "CADASTRE" : escapeHtml(layer.name)}
          </div>
          ${
            visibleRows
              ? visibleRows
              : `<div style="margin-top:5px; color:#666; font-weight:800;">No selected attributes found.</div>`
          }
        </div>
      `
    );
  });

  if (projectGridInfo?.length) {
    addSection(
      LGATE_214_PROJECT_GRID_KEY,
      `
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);">
          <div style="font-weight:950; font-size:13px; color:#111;">
            ${projectGridInfo.length === 1 ? "LANDGATE PROJECT GRID" : "PROJECT GRIDS"}
          </div>
          ${projectGridInfo
            .map((grid, index) => `
              <div style="${index ? "margin-top:8px;" : "margin-top:5px;"} color:#111; word-break:break-word;">
                ${grid.projection ? `<div><span style="font-weight:900; color:#333;">Landgate Project Grid:</span> ${escapeHtml(grid.projection)}</div>` : ""}
                ${grid.projId ? `<div style="margin-top:3px;"><span style="font-weight:900; color:#333;">Grid ID:</span> ${escapeHtml(grid.projId)}</div>` : ""}
              </div>
            `)
            .join("")}
        </div>
      `
    );
  }

  if (districtInfo?.length) {
    addSection(
      LGATE_229_DISTRICTS_KEY,
      `
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);">
          <div style="font-weight:950; font-size:13px; color:#111;">
            ${districtInfo.length === 1 ? "LAND DISTRICT" : "LAND DISTRICTS"}
          </div>
          ${districtInfo
            .map((districtName) => `
              <div style="margin-top:5px; color:#111; word-break:break-word;">
                <span style="font-weight:900; color:#333;">District:</span> ${escapeHtml(districtName)}
              </div>
            `)
            .join("")}
        </div>
      `
    );
  }

  if (roadsNetworkInfo?.length) {
    addSection(
      MRWA_ROADS_NETWORK_KEY,
      `
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.12);">
          <div style="font-weight:950; font-size:13px; color:#111;">
            ROAD NETWORK
          </div>
          ${roadsNetworkInfo
            .map((roadName, index) => `
              <div style="${index ? "margin-top:5px;" : "margin-top:5px;"} color:#111; word-break:break-word;">
                <span style="font-weight:900; color:#333;">Road Name:</span> ${escapeHtml(roadName)}
              </div>
            `)
            .join("")}
        </div>
      `
    );
  }

  const orderedSections = sections
    .filter((section) => section.html)
    .sort((a, b) => a.order - b.order);

  if (!orderedSections.length) {
    return `
      <div style="font-family:Inter,sans-serif; font-size:12px; max-width:260px;">
        <div data-pw-drag-handle="1" style="font-weight:900; font-size:13px; margin-bottom:6px;">
          Map Information
        </div>
        <div style="color:#666; font-weight:800;">
          No visible map information found at this point.
        </div>
        <div style="margin-top:6px; color:#666;">
          Turn on Cadastre, Local Authority, R-Codes Zoning, Contours, Project Grids, MRWA Project Zones, Districts, or Roads Network first.
        </div>
      </div>
    `;
  }

  return `
    <div style="font-family:Inter,sans-serif; font-size:12px; max-width:280px; max-height:300px; overflow:auto;">
      <div data-pw-drag-handle="1" style="font-weight:950; font-size:14px; margin-bottom:6px;">
        Map Information
      </div>
      ${orderedSections.map((section) => section.html).join("")}
    </div>
  `;
}

function openMapInfoPopupAtLatLng(latLng) {
  const map = mapRef.current;
  if (!map || !latLng) return;

  const cadastreOn = (layersRef.current || []).some((l) => l.id === "cad001" && l.visible);
  const activeContourConfigs = DPIRD_CONTOUR_LAYER_CONFIGS.filter((config) =>
    (layersRef.current || []).some((l) => l.id === config.key && l.visible)
  );
  const contourOn = activeContourConfigs.length > 0;
  const projectGridOn = (layersRef.current || []).some(
    (l) => l.id === LGATE_214_PROJECT_GRID_KEY && l.visible
  );
  const districtsOn = (layersRef.current || []).some(
    (l) => l.id === LGATE_229_DISTRICTS_KEY && l.visible
  );
  const roadsNetworkOn = (layersRef.current || []).some(
    (l) => l.id === MRWA_ROADS_NETWORK_KEY && l.visible
  );
  const emptyAddressInfo = { address: "", lotNumber: "" };
  let latestAddressInfo = cadastreOn ? emptyAddressInfo : null;
  let latestContourInfo = null;
  let latestProjectGridInfo = [];
  let latestDistrictInfo = [];
  let latestRoadsNetworkInfo = [];
  const identifySeq = ++contourIdentifySeqRef.current;

  const renderInfoPopup = () => {
    infoWindowRef.current?.setContent(
      buildMapInfoPopupHtml(
        latLng,
        latestAddressInfo,
        latestContourInfo,
        latestProjectGridInfo,
        latestDistrictInfo,
        latestRoadsNetworkInfo
      )
    );
    infoWindowRef.current?.setPosition(latLng);
    infoWindowRef.current?.open({ map });

    window.google?.maps?.event?.addListenerOnce?.(infoWindowRef.current, "domready", () => {
      setTimeout(makeLatestInfoWindowDraggable, 0);
    });
  };

  renderInfoPopup();

  if (contourOn) {
    identifyDpirdContours({
      serviceUrl: DPIRD_CONTOURS_MAPSERVER,
      latLng,
      map,
      mapDiv: mapDivRef.current,
      tolerance: DPIRD_CONTOUR_IDENTIFY_TOLERANCE_PX,
      contourConfigs: activeContourConfigs,
    })
      .then((contourInfo) => {
        if (!contourInfo) return;
        if (contourIdentifySeqRef.current !== identifySeq) return;
        if (!infoModeRef.current) return;
        if (
          !(layersRef.current || []).some(
            (l) => l.id === contourInfo.layerKey && l.visible
          )
        ) {
          return;
        }
        latestContourInfo = contourInfo;
        renderInfoPopup();
      })
      .catch((err) => {
        if (contourIdentifySeqRef.current !== identifySeq) return;
        console.warn("DPIRD contour identify failed:", err);
      });
  }

  if (projectGridOn) {
    identifyProjectGrid214({
      serviceUrl: LGATE_214_PROJECT_GRID_MAPSERVER,
      latLng,
      map,
      mapDiv: mapDivRef.current,
      tolerance: LGATE_214_PROJECT_GRID_IDENTIFY_TOLERANCE_PX,
    })
      .then((projectGridInfo) => {
        if (!projectGridInfo?.length) return;
        if (contourIdentifySeqRef.current !== identifySeq) return;
        if (!infoModeRef.current) return;
        if (!(layersRef.current || []).some((l) => l.id === LGATE_214_PROJECT_GRID_KEY && l.visible)) {
          return;
        }
        latestProjectGridInfo = projectGridInfo;
        renderInfoPopup();
      })
      .catch((err) => {
        if (contourIdentifySeqRef.current !== identifySeq) return;
        console.warn("LGATE-214 project grid identify failed:", err);
      });
  }

  if (districtsOn) {
    identifyLandgateDistricts({
      serviceUrl: LGATE_BOUNDARIES_MAPSERVER,
      latLng,
      map,
      mapDiv: mapDivRef.current,
      tolerance: LGATE_229_DISTRICTS_IDENTIFY_TOLERANCE_PX,
    })
      .then((districtNames) => {
        if (!districtNames?.length) return;
        if (contourIdentifySeqRef.current !== identifySeq) return;
        if (!infoModeRef.current) return;
        if (!(layersRef.current || []).some((l) => l.id === LGATE_229_DISTRICTS_KEY && l.visible)) {
          return;
        }
        if (!infoWindowRef.current?.getMap?.()) return;
        latestDistrictInfo = districtNames;
        renderInfoPopup();
      })
      .catch((err) => {
        if (contourIdentifySeqRef.current !== identifySeq) return;
        console.warn("LGATE-229 Districts identify failed:", err);
      });
  }

  if (roadsNetworkOn) {
    identifyMrwaRoadsNetwork({
      serviceUrl: MRWA_ROADS_NETWORK_MAPSERVER,
      latLng,
      map,
      mapDiv: mapDivRef.current,
      tolerance: MRWA_ROADS_NETWORK_IDENTIFY_TOLERANCE_PX,
    })
      .then((roadNames) => {
        if (!roadNames?.length) return;
        if (contourIdentifySeqRef.current !== identifySeq) return;
        if (!infoModeRef.current) return;
        if (!(layersRef.current || []).some((l) => l.id === MRWA_ROADS_NETWORK_KEY && l.visible)) {
          return;
        }
        if (!infoWindowRef.current?.getMap?.()) return;
        latestRoadsNetworkInfo = roadNames;
        renderInfoPopup();
      })
      .catch((err) => {
        if (contourIdentifySeqRef.current !== identifySeq) return;
        console.warn("MRWA Roads Network identify failed:", err);
      });
  }

  if (!cadastreOn) return;

  const html = buildMapInfoPopupHtml(
    latLng,
    latestAddressInfo,
    latestContourInfo,
    latestProjectGridInfo,
    latestDistrictInfo,
    latestRoadsNetworkInfo
  );
  if (!html.includes("CADASTRE")) return;

  const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const cacheKey = `${lat.toFixed(7)},${lng.toFixed(7)}`;
  const cached = lgate002AddressCacheRef.current.get(cacheKey);
  const applyAddressInfo = (info) => {
    if (!infoWindowRef.current?.getMap?.()) return;
    latestAddressInfo = info || emptyAddressInfo;
    renderInfoPopup();
  };

  if (cached) {
    if (cached.status === "ready") applyAddressInfo(cached.value);
    if (cached.status === "pending") cached.promise.then(applyAddressInfo);
    return;
  }

  const promise = fetchLgate002AddressAtLatLng(latLng);
  lgate002AddressCacheRef.current.set(cacheKey, { status: "pending", promise });
  promise.then((info) => {
    const value = info || emptyAddressInfo;
    lgate002AddressCacheRef.current.set(cacheKey, { status: "ready", value });
    applyAddressInfo(value);
  });
}

function refreshBushfireLayerStyle() {
  const store = polygonLayersRef.current.get("bushfire001");
  const layer = (layersRef.current || []).find((l) => l.id === "bushfire001");
  if (!store?.polygons || !layer?.data?.style) return;

  store.polygons.setStyle(layer.data.style);
}

function stopInfoMode() {
  contourIdentifySeqRef.current += 1;
  infoModeRef.current = false;
  setInfoMode(false);

  try {
    mapRef.current?.setOptions({ draggableCursor: null });
    refreshBushfireLayerStyle();
  } catch {
    // ignore
  }
}

function toggleInfoMode() {
  clearMeasure();
  clearExportInteraction();
  setNoteAddMode(false);

  const next = !infoModeRef.current;
  if (!next) contourIdentifySeqRef.current += 1;
  infoModeRef.current = next;
  setInfoMode(next);

  try {
    mapRef.current?.setOptions({ draggableCursor: next ? "help" : null });
    refreshBushfireLayerStyle();
  } catch {
    // ignore
  }
}

async function getPopupPcg2020Coordinate({ cacheKey, lng, lat }) {
  const lo = Number(lng);
  const la = Number(lat);
  if (!EXPORT_TRANSFORM_SERVICE_ENDPOINT || !Number.isFinite(lo) || !Number.isFinite(la)) {
    return null;
  }

  const cache = geodeticPcg2020CacheRef.current;
  const cached = cache.get(cacheKey);
  if (cached?.status === "ready") return cached.value;
  if (cached?.status === "pending") return cached.promise;

  const promise = (async () => {
    const endpoint = getExportTransformServiceUrl(EXPORT_TRANSFORM_SERVICE_ENDPOINT);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const headers = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sourceDatumFamily: "GDA94",
        targetProjection: "PCG2020",
        points: [{ lng: lo, lat: la }],
      }),
    });

    if (!response.ok) {
      throw new Error(`PCG2020 popup transform failed (${response.status})`);
    }

    const payload = await response.json();
    if (payload?.accuracyStatus !== "official-grid") return null;

    const point = payload?.points?.[0];
    const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x);
    const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { easting: x, northing: y };
  })();

  cache.set(cacheKey, { status: "pending", promise });

  try {
    const value = await promise;
    if (value) {
      cache.set(cacheKey, { status: "ready", value });
    } else {
      cache.delete(cacheKey);
    }
    return value;
  } catch (error) {
    cache.delete(cacheKey);
    console.warn("[Maps popup] PCG2020 transform unavailable", { cacheKey, error });
    return null;
  }
}

function maybeLoadPopupPcg2020({ layer, name, props, lat, lng, markerId }) {
  const layerTag = layer?.data?.layerTag;
  if (!isGeodeticPopupLayer(layerTag) || !hasMga2020PopupCoords(props)) return;

  const markerKey = `${layer.id}::${markerId}`;
  const cacheKey = `${markerKey}::PCG2020`;

  getPopupPcg2020Coordinate({ cacheKey, lng, lat }).then((pcg2020) => {
    if (!pcg2020) return;
    if (!mainInfoOpenRef.current || activeMainInfoKeyRef.current !== markerKey) return;

    const html = buildPopupHtmlExample({
      layerTag,
      name,
      props: { ...props, lat, lng },
      pcg2020,
    });

    infoWindowRef.current?.setContent(html);
    window.google?.maps?.event?.addListenerOnce?.(infoWindowRef.current, "domready", () => {
      setTimeout(makeLatestInfoWindowDraggable, 0);
    });
  });
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
    const addressState = getJobAddressWarning(job);
    const safeAddr = addressState.displayAddress;
    const addressStyle = "color:#111;";
    const addressBadge = addressState.label
      ? `<span style="display:inline-flex; margin-left:6px; padding:1px 6px; border:1px solid rgba(183,28,28,0.28); border-radius:999px; background:rgba(211,47,47,0.08); color:#b71c1c; font-size:10px; font-weight:400; line-height:1.2; white-space:nowrap;">${addressState.label}</span>`
      : "";
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

<div style="${addressStyle} margin-top:6px;">${safeAddr}${addressBadge}</div>

<div style="margin-top:8px; font-size:12px; color:#333;">
  <div><span style="font-weight:900;">Assigned:</span> ${safeAssigned}</div>
  <div><span style="font-weight:900;">Job type:</span> ${safeJobType}</div>
  <div><span style="font-weight:900;">Local authority:</span> ${safeLA}</div>
</div>

        <div style="display:flex; gap:8px; margin-top:10px;">
          <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildLatLngSearchUrl(pt.lat, pt.lng)}" target="_blank" rel="noreferrer"
             style="flex:1; text-align:center; text-decoration:none; padding:7px 8px; border-radius:8px;
                    border:1px solid #ccc; color:#111; background:#fff; font-weight:900; font-size:12px;">
            🔍 Maps
          </a>
          <a onclick="window.__pwMapsPrepareExternalNav && window.__pwMapsPrepareExternalNav()" href="${buildDirectionsUrl(pt.lat, pt.lng)}" rel="noreferrer"
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
  const addressState = getJobAddressWarning(job);
  const safeAddr = addressState.displayAddress;
  const addressStyle = "color:#111;";
  const addressBadge = addressState.label
    ? `<span style="display:inline-flex; margin-left:6px; padding:1px 6px; border:1px solid rgba(183,28,28,0.28); border-radius:999px; background:rgba(211,47,47,0.08); color:#b71c1c; font-size:10px; font-weight:400; line-height:1.2; white-space:nowrap;">${addressState.label}</span>`
    : "";
  const safeJobType = job.job_type_legacy || "—";

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; font-size: 12px; min-width: 230px;">
      <div style="font-weight:900; font-size:13px; color:#111;">Job #${job.job_number}</div>
      <div style="font-weight:800; color:#333; margin-top:2px;">${safeClient}</div>
      <div style="${addressStyle} margin-top:2px;">${safeAddr}${addressBadge}</div>
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
const titleAddr = getJobAddressWarning(job).displayAddress;
const safeJobType = job.job_type_legacy || "—";

marker = new window.google.maps.Marker({
  position: pt,
  map: null,
  title: `Job #${job.job_number}\n${safeClient}\n${titleAddr}\nType: ${safeJobType}`,
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

const showAddressMarker = (addressString, position, title = addressString) => {
  const map = mapRef.current;
  if (!map || !window.google || !position) return;

  map.setCenter(position);
  map.setZoom(17);

  if (!addressMarkerRef.current) {
    addressMarkerRef.current = new window.google.maps.Marker({
      position,
      map,
      title,
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
    addressMarkerRef.current.setTitle(title);
    if (!addressMarkerRef.current.getMap()) addressMarkerRef.current.setMap(map);
  }

  setSelectedAddress({
    address: addressString,
    lat: position.lat,
    lng: position.lng,
  });
  openAddressInfo(addressString, position, addressMarkerRef.current);
};

const focusPortalJobAddress = (job, addressState) => {
  const map = mapRef.current;
  if (!map || !window.google) return false;

  const label = job?.job_number ? `Job #${job.job_number}` : "Selected job";

  if (addressState.hasGoogleAddress && window.google.maps.places?.PlacesService) {
    const service = new window.google.maps.places.PlacesService(map);
    service.getDetails(
      { placeId: String(job.place_id).trim(), fields: ["geometry", "formatted_address", "name"] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
          setPortalJobsError("Google could not locate this job address. Please verify the job address from the Jobs page.");
          return;
        }
        const loc = place?.geometry?.location;
        if (!loc) {
          setPortalJobsError("Google could not locate this job address. Please verify the job address from the Jobs page.");
          return;
        }

        const addressString = place.formatted_address || place.name || addressState.displayAddress || label;
        showAddressMarker(addressString, { lat: loc.lat(), lng: loc.lng() }, addressString);
      }
    );
    return true;
  }

  if (addressState.fallbackAddress && window.google.maps.Geocoder) {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { address: addressState.fallbackAddress, componentRestrictions: { country: "AU" } },
      (results, status) => {
        if (status !== "OK" || !results?.[0]?.geometry?.location) {
          setPortalJobsError("Google could not locate this manual address. Please verify the job address from the Jobs page.");
          return;
        }

        const loc = results[0].geometry.location;
        const addressString = results[0].formatted_address || addressState.fallbackAddress;
        showAddressMarker(addressString, { lat: loc.lat(), lng: loc.lng() }, addressString);
      }
    );
    return true;
  }

  return false;
};

const handleSelectPortalJob = (job) => {
  const addressState = getJobAddressWarning(job);
  if (addressState.hasNoAddress) {
    setPortalJobsError("This job does not currently have a searchable address. Please update the job address from the Jobs page.");
    return;
  }
  setPortalSelectedJobId(job.id);
  setPortalJobsError("");

  const pt = portalPointsByIdRef.current.get(job.id);
  if (addressState.hasGoogleAddress && focusPortalJobAddress(job, addressState)) return;
  if (!pt && focusPortalJobAddress(job, addressState)) return;

  focusPortalJob(job);

  // Open the summary popup automatically after the map recentres
  setTimeout(() => {
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
        handleSelectPortalJob(match);
        setJobNumberQuery(String(match.job_number ?? ""));
        setJobPicked(true);
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

  const map = mapRef.current;
  if (!map) return;

  // Toggle off if already following
  if (locationWatchIdRef.current !== null) {
    stopLocationTracking();
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
      stopLocationTracking();

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

  async function fetchArcgisGeojsonByFence(
    url,
    fence,
    where = "1=1",
    pageSize = EXPORT_PAGE_SIZE,
    options = {}
  ) {
    const allFeatures = [];
    let offset = 0;
    let safety = 0;

    while (safety < 50) {
      const params = new URLSearchParams({
        where,
        outFields: Array.isArray(options.outFields)
          ? options.outFields.join(",")
          : options.outFields || "*",
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

      const exceeded =
        !!json?.exceededTransferLimit || !!json?.properties?.exceededTransferLimit;
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

  function dedupeFeatureCollectionForExport(featureCollection, layer) {
    const fields = layer?.data?.exportDedupeFields || layer?.data?.idFields || [];
    if (!fields.length) return featureCollection;

    const seen = new Set();
    const features = [];
    (featureCollection?.features || []).forEach((feature, index) => {
      const props = feature?.properties || {};
      const key =
        fields
          .map((field) => cleanInfoPart(props[field]))
          .filter(Boolean)
          .join("::") || `${layer?.id || "feature"}_${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      features.push(feature);
    });

    return { ...featureCollection, features };
  }

  function prepareLayerExportFeatureCollection(featureCollection, layer) {
    return dedupeFeatureCollectionForExport(
      applyLayerExportFilter(featureCollection, layer),
      layer
    );
  }

  function getExportAttributesForCsv(props = {}, layer) {
    const fields = layer?.data?.exportAttributeFields;
    if (!Array.isArray(fields)) return props;

    return fields.reduce((acc, field) => {
      acc[field] = props?.[field];
      return acc;
    }, {});
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

  function resolveExportProjectionCode(projectionCode) {
    if (!projectionCode) {
      console.warn(
        `[Maps export] No projection selected; falling back to ${DEFAULT_PROJECTION_CODE} (${getProjectionLabel(DEFAULT_PROJECTION_CODE)}).`
      );
      return DEFAULT_PROJECTION_CODE;
    }

    if (!PROJECTION_OPTIONS.some((opt) => opt.code === projectionCode)) {
      throw new Error(`Unknown export projection: ${projectionCode}`);
    }

    return projectionCode;
  }

  function getProjectionDatumFamily(projectionCode) {
    const selectedProjectionCode = resolveExportProjectionCode(projectionCode);
    const option = PROJECTION_OPTIONS.find((opt) => opt.code === selectedProjectionCode);

    if (option?.group === "GDA2020") return "GDA2020";
    if (option?.group === "GDA94") return "GDA94";
    if (option?.group === "AGD84") return "AGD84";
    if (selectedProjectionCode === "EPSG:4326" || selectedProjectionCode === "CIG92" || selectedProjectionCode === "CKIG92") {
      return "WGS84";
    }
    if (selectedProjectionCode === "EPSG:3857") return "Web Mercator";
    return "Other/unknown";
  }

  function getExportTransformRoute(projectionCode) {
    const selectedProjectionCode = resolveExportProjectionCode(projectionCode);
    const datumFamily = getProjectionDatumFamily(selectedProjectionCode);

    if (datumFamily === "GDA94") {
      return {
        datumFamily,
        route:
          "geometry lon/lat/GDA2020 -> GDA94 datum transformation placeholder -> selected GDA94 projection",
        currentBrowserRoute:
          "geometry lon/lat -> current browser projection path; official GDA2020->GDA94 datum/grid transformation not yet implemented",
        usesValidatedDatumGrid: false,
      };
    }

    if (datumFamily === "AGD84") {
      return {
        datumFamily,
        route:
          "geometry lon/lat/GDA2020 -> AGD84 datum transformation placeholder -> selected AGD84 projection",
        currentBrowserRoute:
          "geometry lon/lat -> current browser projection path; official GDA2020->AGD84 datum/grid transformation not yet implemented",
        usesValidatedDatumGrid: false,
      };
    }

    return {
      datumFamily,
      route: "geometry lon/lat -> selected projection",
      currentBrowserRoute: "geometry lon/lat -> selected projection",
      usesValidatedDatumGrid: datumFamily === "GDA2020" || datumFamily === "WGS84" || datumFamily === "Web Mercator",
    };
  }

  function getLayerExportSourceDatumFamily(layer) {
    return layer?.data?.exportSourceDatum || "GDA94";
  }

  function isDesktopPointerDevice() {
    if (isMobile || typeof window === "undefined") return false;
    return window.matchMedia?.("(pointer: fine)")?.matches !== false;
  }

  function clampExportDialogPosition(left, top, rect = null) {
    if (typeof window === "undefined") return { left, top };
    const dialogRect = rect || exportDialogRef.current?.getBoundingClientRect();
    const width = dialogRect?.width || 560;
    const height = dialogRect?.height || 400;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);

    return {
      left: Math.min(Math.max(left, margin), maxLeft),
      top: Math.min(Math.max(top, margin), maxTop),
    };
  }

  function handleExportDialogHeaderPointerDown(e) {
    if (!isDesktopPointerDevice() || e.button !== 0) return;
    if (e.target?.closest?.("button, input, select, textarea, label, a")) return;

    const dialog = exportDialogRef.current;
    if (!dialog) return;

    const rect = dialog.getBoundingClientRect();
    const currentPosition = exportDialogPosition || { left: rect.left, top: rect.top };

    exportDialogDragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - currentPosition.left,
      offsetY: e.clientY - currentPosition.top,
    };

    setExportDialogPosition(clampExportDialogPosition(currentPosition.left, currentPosition.top, rect));
    setExportDialogDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function handleExportDialogHeaderPointerMove(e) {
    const drag = exportDialogDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !isDesktopPointerDevice()) return;

    setExportDialogPosition(
      clampExportDialogPosition(e.clientX - drag.offsetX, e.clientY - drag.offsetY)
    );
  }

  function endExportDialogDrag(e) {
    const drag = exportDialogDragRef.current;
    if (drag && e?.pointerId === drag.pointerId) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    exportDialogDragRef.current = null;
    setExportDialogDragging(false);
  }

  const EXPORT_GDA94_GEOGRAPHIC = "EXPORT:GDA94_GEOGRAPHIC";
  const EXPORT_GDA94_TO_GDA2020_GEOGRAPHIC = "EXPORT:GDA94_TO_GDA2020_GEOGRAPHIC";
  const EXPORT_AGD84_GEOGRAPHIC = "EXPORT:AGD84_GEOGRAPHIC";
  const GDA2020_GRID_FALLBACK_WARNING =
    "Approximate only — official NTv2 grid transformation not applied.";
  const EXPORT_TRANSFORM_SERVICE_ENDPOINT =
    import.meta.env.VITE_EXPORT_TRANSFORM_SERVICE_ENDPOINT || "";

  const MGA_ZONE_PROJECTIONS = {
    GDA94: { 49: "EPSG:28349", 50: "EPSG:28350", 51: "EPSG:28351", 52: "EPSG:28352" },
    GDA2020: { 49: "EPSG:7849", 50: "EPSG:7850", 51: "EPSG:7851", 52: "EPSG:7852" },
    AGD84: { 49: "EPSG:20349", 50: "EPSG:20350", 51: "EPSG:20351", 52: "EPSG:20352" },
  };

  function ensureExportDatumTransformDefs() {
    // Projection TM settings stay in projections.js. These aliases only provide datum transforms.
    if (!proj4.defs(EXPORT_GDA94_GEOGRAPHIC)) {
      proj4.defs(EXPORT_GDA94_GEOGRAPHIC, "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
    }
    if (!proj4.defs(EXPORT_GDA94_TO_GDA2020_GEOGRAPHIC)) {
      proj4.defs(
        EXPORT_GDA94_TO_GDA2020_GEOGRAPHIC,
        "+proj=longlat +ellps=GRS80 +towgs84=-0.06155,0.01087,0.04019,0.0394924,0.0327221,0.0328979,0.009994 +no_defs"
      );
    }
    if (!proj4.defs(EXPORT_AGD84_GEOGRAPHIC)) {
      proj4.defs(
        EXPORT_AGD84_GEOGRAPHIC,
        "+proj=longlat +ellps=aust_SA +towgs84=-117.763,-51.510,139.061,-0.292,-0.443,-0.277,-0.191 +no_defs"
      );
    }
  }

  function inferMgaZoneFromLng(lng) {
    const lon = Number(lng);
    if (!Number.isFinite(lon)) return null;
    const zone = Math.floor((lon + 180) / 6) + 1;
    return zone >= 49 && zone <= 52 ? zone : null;
  }

  function getSelectedMgaZone(projectionCode) {
    const selectedProjectionCode = resolveExportProjectionCode(projectionCode);
    for (const zoneMap of Object.values(MGA_ZONE_PROJECTIONS)) {
      const match = Object.entries(zoneMap).find(([, code]) => code === selectedProjectionCode);
      if (match) return Number(match[0]);
    }
    return null;
  }

  function getTargetProjection(projectionCode, lng) {
    const selectedProjectionCode = resolveExportProjectionCode(projectionCode);
    const selectedZone = getSelectedMgaZone(selectedProjectionCode);
    if (selectedZone) return selectedProjectionCode;

    const inferredZone = inferMgaZoneFromLng(lng);
    if (!inferredZone) return selectedProjectionCode;

    if (selectedProjectionCode === "MGA94") return MGA_ZONE_PROJECTIONS.GDA94[inferredZone];
    if (selectedProjectionCode === "MGA2020") return MGA_ZONE_PROJECTIONS.GDA2020[inferredZone];
    if (selectedProjectionCode === "AMG84") return MGA_ZONE_PROJECTIONS.AGD84[inferredZone];
    return selectedProjectionCode;
  }

  function getEffectiveSourceDatumFamily(sourceDatumFamily) {
    return sourceDatumFamily === "WGS84" ? "WGS84" : "GDA94";
  }

  function getSourceProjection(sourceDatumFamily, targetDatumFamily) {
    const effectiveSourceDatum = getEffectiveSourceDatumFamily(sourceDatumFamily);
    if (effectiveSourceDatum === "WGS84") return "EPSG:4326";
    if (targetDatumFamily === "GDA2020") return EXPORT_GDA94_TO_GDA2020_GEOGRAPHIC;
    return EXPORT_GDA94_GEOGRAPHIC;
  }

  function shouldUseServerDatumTransform(sourceDatumFamily, targetDatumFamily) {
    return (
      getEffectiveSourceDatumFamily(sourceDatumFamily) === "GDA94" &&
      targetDatumFamily === "GDA2020"
    );
  }

  function getExportCoordinateKey(lng, lat, projectionCode, sourceDatumFamily) {
    const lo = Number(lng);
    const la = Number(lat);
    const selectedProjectionCode = getTargetProjection(projectionCode, lo);
    return `${getEffectiveSourceDatumFamily(sourceDatumFamily)}|${selectedProjectionCode}|${lo}|${la}`;
  }

  function addExportCoordinateRequest(requests, coord, projectionCode, sourceDatumFamily) {
    const lng = Number(coord?.[0]);
    const lat = Number(coord?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    const selectedProjectionCode = getTargetProjection(projectionCode, lng);
    const targetDatumFamily = getProjectionDatumFamily(selectedProjectionCode);
    if (!shouldUseServerDatumTransform(sourceDatumFamily, targetDatumFamily)) return;

    requests.push({
      key: getExportCoordinateKey(lng, lat, projectionCode, sourceDatumFamily),
      lng,
      lat,
    });
  }

  function collectExportTransformRequests(collections, projectionCode, format) {
    const requests = [];

    for (const { featureCollection, sourceDatumFamily = "GDA94" } of collections || []) {
      (featureCollection?.features || []).forEach((feature) => {
        const geometry = feature?.geometry;

        getPointCoordinateSets(geometry).forEach((coord) => {
          addExportCoordinateRequest(requests, coord, projectionCode, sourceDatumFamily);
        });

        if (format !== "dxf") return;

        const lineSets = getLineCoordinateSets(geometry);
        lineSets.forEach((coords) => {
          coords.forEach((coord) => addExportCoordinateRequest(requests, coord, projectionCode, sourceDatumFamily));
        });

        if (lineSets[0]?.length) {
          const anchor = getLineLabelCoord(lineSets[0]);
          if (anchor) addExportCoordinateRequest(requests, anchor, projectionCode, sourceDatumFamily);
        }

        const ringSets = getPolygonRingSets(geometry);
        ringSets.forEach((ring) => {
          ring.forEach((coord) => addExportCoordinateRequest(requests, coord, projectionCode, sourceDatumFamily));
        });

        if (ringSets[0]?.length) {
          const anchor = getPolygonLabelCoord(ringSets[0]);
          if (anchor) addExportCoordinateRequest(requests, anchor, projectionCode, sourceDatumFamily);
        }
      });
    }

    return requests;
  }

  function getExportTransformServiceUrl(baseEndpoint) {
    const base = String(baseEndpoint || "").trim();
    if (!base) return "";
    return `${base.replace(/\/+$/, "")}/transform/export-coordinates`;
  }

  async function requestOfficialGridTransforms(transformContext) {
    const endpoint = getExportTransformServiceUrl(transformContext?.serverEndpoint);
    const requests = transformContext?.requests || [];
    if (!endpoint || !requests.length) return false;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error("No Supabase access token available for export transform service.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceDatumFamily: "GDA94",
        targetProjection: transformContext.selectedProjectionCode,
        points: requests.map(({ lng, lat }) => ({ lng, lat })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Export transform service failed (${response.status}): ${detail || response.statusText}`);
    }

    const payload = await response.json();
    if (payload?.accuracyStatus !== "official-grid") {
      throw new Error(`Export transform service did not return official-grid status: ${payload?.accuracyStatus || "unknown"}`);
    }
    if (!Array.isArray(payload?.points) || payload.points.length !== requests.length) {
      throw new Error("Export transform service returned an unexpected point count.");
    }

    payload.points.forEach((point, index) => {
      const [x, y] = point || [];
      if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
        throw new Error(`Export transform service returned invalid coordinate at index ${index}.`);
      }
      transformContext.serverCoordinates.set(requests[index].key, { x: Number(x), y: Number(y) });
    });

    transformContext.transformSource = "official-grid";
    transformContext.usingBrowserFallback = false;
    transformContext.fallbackWarning = "";
    return true;
  }

  function createExportTransformContext(collections, projectionCode, format = null) {
    const selectedProjectionCode = resolveExportProjectionCode(projectionCode);
    const targetDatumFamily = getProjectionDatumFamily(selectedProjectionCode);
    const shouldBatchTransform = format === "csv" || format === "dxf";
    const requests = shouldBatchTransform
      ? collectExportTransformRequests(collections, selectedProjectionCode, format)
      : [];
    const needsGridTransform = requests.length > 0;

    return {
      selectedProjectionCode,
      targetDatumFamily,
      needsServerGridTransform: needsGridTransform,
      serverEndpoint: EXPORT_TRANSFORM_SERVICE_ENDPOINT,
      serverCoordinates: new Map(),
      transformSource: needsGridTransform && EXPORT_TRANSFORM_SERVICE_ENDPOINT ? "pending" : "fallback",
      usingBrowserFallback: needsGridTransform && !EXPORT_TRANSFORM_SERVICE_ENDPOINT,
      fallbackWarning:
        needsGridTransform && !EXPORT_TRANSFORM_SERVICE_ENDPOINT
          ? GDA2020_GRID_FALLBACK_WARNING
          : "",
      requests,
    };
  }

  async function prepareExportTransformContext(collections, projectionCode, format = null) {
    const transformContext = createExportTransformContext(collections, projectionCode, format);

    if (!transformContext.needsServerGridTransform) {
      return transformContext;
    }

    try {
      await requestOfficialGridTransforms(transformContext);
    } catch (error) {
      transformContext.transformSource = "fallback";
      transformContext.usingBrowserFallback = true;
      transformContext.fallbackWarning = GDA2020_GRID_FALLBACK_WARNING;
      console.warn("[Maps export] " + GDA2020_GRID_FALLBACK_WARNING, {
        selectedProjection: transformContext.selectedProjectionCode,
        targetDatum: transformContext.targetDatumFamily,
        endpoint: transformContext.serverEndpoint,
        error,
      });
    }

    console.info("[Maps export] Export transform source:", transformContext.transformSource, {
      selectedProjection: transformContext.selectedProjectionCode,
      requestedCoordinateCount: transformContext.requests.length,
      transformedCoordinateCount: transformContext.serverCoordinates.size,
    });

    return transformContext;
  }

  function transformExportPoint(lng, lat, projectionCode, sourceDatumFamily = "GDA94", transformContext = null) {
    ensureExportDatumTransformDefs();

    const lo = Number(lng);
    const la = Number(lat);
    if (!Number.isFinite(lo) || !Number.isFinite(la)) return null;

    const selectedProjectionCode = getTargetProjection(projectionCode, lo);
    const targetDatumFamily = getProjectionDatumFamily(selectedProjectionCode);
    const effectiveSourceDatum = getEffectiveSourceDatumFamily(sourceDatumFamily);
    const sourceProjection = getSourceProjection(effectiveSourceDatum, targetDatumFamily);
    const serverCoordinate = transformContext?.serverCoordinates?.get(
      getExportCoordinateKey(lo, la, selectedProjectionCode, effectiveSourceDatum)
    );
    if (serverCoordinate) {
      return {
        x: serverCoordinate.x,
        y: serverCoordinate.y,
        source: "official-grid-service",
        destination: selectedProjectionCode,
        routeUsed: `GDA94 geographic -> official NTv2 grid service -> ${selectedProjectionCode}`,
        accuracyWarning: "",
      };
    }

    const usingApproximateFallback =
      transformContext?.usingBrowserFallback &&
      shouldUseServerDatumTransform(effectiveSourceDatum, targetDatumFamily);
    let output = null;
    let routeUsed = effectiveSourceDatum + " geographic -> " + selectedProjectionCode;

    try {
      if (targetDatumFamily === "AGD84" && effectiveSourceDatum === "GDA94") {
        const [agdLng, agdLat] = proj4(EXPORT_GDA94_GEOGRAPHIC, EXPORT_AGD84_GEOGRAPHIC, [lo, la]);
        output = projectCoords(agdLng, agdLat, EXPORT_AGD84_GEOGRAPHIC, selectedProjectionCode);
        routeUsed = "GDA94 geographic -> AGD84 geographic -> " + selectedProjectionCode;
      } else {
        output = projectCoords(lo, la, sourceProjection, selectedProjectionCode);
        if (targetDatumFamily === "GDA2020" && effectiveSourceDatum === "GDA94") {
          routeUsed = usingApproximateFallback
            ? "GDA94 geographic -> approximate 7-parameter GDA2020 fallback -> " + selectedProjectionCode
            : "GDA94 geographic -> GDA2020 geographic -> " + selectedProjectionCode;
        } else if (targetDatumFamily === "GDA94" && effectiveSourceDatum === "GDA94") {
          routeUsed = "GDA94 geographic -> " + selectedProjectionCode;
        }
      }
    } catch (error) {
      console.warn("[Maps export] Projection transform failed", {
        selectedProjection: selectedProjectionCode,
        sourceDatum: effectiveSourceDatum,
        targetDatum: targetDatumFamily,
        sourceProjection,
        inputLngLat: { lng: lo, lat: la },
        error,
      });
      return null;
    }

    const [x, y] = output || [];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const debugKey = selectedProjectionCode + "|" + effectiveSourceDatum + "|" + targetDatumFamily;
    if (!transformExportPoint.loggedDebugKeys) transformExportPoint.loggedDebugKeys = new Set();
    if (!transformExportPoint.loggedDebugKeys.has(debugKey)) {
      transformExportPoint.loggedDebugKeys.add(debugKey);
      console.info("[Maps export] final coordinate", {
        selectedProjection: selectedProjectionCode,
        selectedProjectionName: getProjectionLabel(selectedProjectionCode),
        sourceDatum: effectiveSourceDatum,
        targetDatum: targetDatumFamily,
        sourceProjection,
        targetProjection: selectedProjectionCode,
        inputLngLat: { lng: lo, lat: la },
        outputCoordinate: { x, y },
        routeUsed,
        accuracyWarning: usingApproximateFallback ? GDA2020_GRID_FALLBACK_WARNING : "",
      });
    }

    return {
      x,
      y,
      source: sourceProjection,
      destination: selectedProjectionCode,
      routeUsed,
      accuracyWarning: usingApproximateFallback ? GDA2020_GRID_FALLBACK_WARNING : "",
    };
  }

  function getPreferredPointXY(coord, projectionCode, sourceDatumFamily = "GDA94", transformContext = null) {
    const lng = Number(coord?.[0]);
    const lat = Number(coord?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return transformExportPoint(lng, lat, projectionCode, sourceDatumFamily, transformContext);
  }
  function collectCsvRowsFromCollections(collections, projectionCode, transformContext = null) {
    const rows = [];
    const preferredOrder = [];
    const attrKeySet = new Set();

    for (const { layer, featureCollection, sourceDatumFamily = "unknown" } of collections) {
      (layer?.data?.exportFieldOrder || []).forEach((key) => {
        if (!preferredOrder.includes(key)) preferredOrder.push(key);
      });

      (featureCollection?.features || []).forEach((feature, featureIndex) => {
        const props = feature?.properties || {};
        const csvAttributes = getExportAttributesForCsv(props, layer);
        const baseId = getFeaturePointId(
          props,
          layer,
          `${layer?.id || "feature"}_${featureIndex + 1}`
        );

        const pointSets = getPointCoordinateSets(feature?.geometry);
pointSets.forEach((coord, pointIndex) => {
	  const preferredXY = getPreferredPointXY(coord, projectionCode, sourceDatumFamily, transformContext);
	  if (!preferredXY) return;
	
	  const { x, y } = preferredXY;
	  const csvX = formatExportNumber(x, projectionCode, "xy");
	  const csvY = formatExportNumber(y, projectionCode, "xy");
	
	  const geomZ = Number(coord?.[2]);
	  const attrZ = getFeatureZValue(props, layer);
	  const zValue = Number.isFinite(geomZ) ? geomZ : attrZ;

          Object.keys(csvAttributes).forEach((key) => attrKeySet.add(key));

	          rows.push({
	            feature_id: pointSets.length > 1 ? `${baseId}_${pointIndex + 1}` : baseId,
	            x: csvX,
	            y: csvY,
            z:
              zValue !== "" && zValue !== null && zValue !== undefined
                ? formatExportNumber(zValue, projectionCode, "z")
                : "",
            layer_name: layer?.data?.csvLayerName || layer?.name || layer?.id || "Layer",
            attributes: csvAttributes,
          });
        });

        const lineSets = layer?.data?.csvGeometry === "line"
          ? getLineCoordinateSets(feature?.geometry)
          : [];
        lineSets.forEach((coords, lineIndex) => {
          coords.forEach((coord, vertexIndex) => {
            const preferredXY = getPreferredPointXY(coord, projectionCode, sourceDatumFamily, transformContext);
            if (!preferredXY) return;

            Object.keys(csvAttributes).forEach((key) => attrKeySet.add(key));

            rows.push({
              feature_id: `${baseId}_${lineIndex + 1}_${vertexIndex + 1}`,
              x: formatExportNumber(preferredXY.x, projectionCode, "xy"),
              y: formatExportNumber(preferredXY.y, projectionCode, "xy"),
              z: Number.isFinite(Number(coord?.[2]))
                ? formatExportNumber(Number(coord[2]), projectionCode, "z")
                : "",
              layer_name: layer?.data?.csvLayerName || layer?.name || layer?.id || "Layer",
              attributes: csvAttributes,
            });
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

  function buildCombinedPointCsv(collections, projectionCode, transformContext = null) {
    const { rows, orderedAttrKeys } = collectCsvRowsFromCollections(collections, projectionCode, transformContext);

    if (!rows.length) {
      throw new Error("No CSV-supported features found inside the fence.");
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

  function buildDxfFromCollections(collections, projectionCode, transformContext = null) {
    const layerNames = [];
    let entities = "";

    const textHeight = isGeographicProjectionCode(projectionCode) ? 0.00015 : 1.5;

    for (const { layer, featureCollection, sourceDatumFamily = "unknown" } of collections) {
      const layerName = getLayerExportName(layer);
      layerNames.push(layerName);

      (featureCollection?.features || []).forEach((feature, featureIndex) => {
        const props = feature?.properties || {};
        const geometry = feature?.geometry;
        const labelText = getFeatureLabelText(props, layer);

	const pointSets = getPointCoordinateSets(geometry);
if (pointSets.length) {
  const pointTrueColor = getPointLayerDxfTrueColor(layer);

  pointSets.forEach((coord) => {
    const preferredXY = getPreferredPointXY(coord, projectionCode, sourceDatumFamily, transformContext);
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
                return transformExportPoint(lng, lat, projectionCode, sourceDatumFamily, transformContext);
              })
              .filter(Boolean);

            if (pts.length >= 2) {
              entities += buildDxfLwPolylineEntity(layerName, pts, false);
            }
          });

          if (labelText && lineSets[0]?.length) {
            const anchor = getLineLabelCoord(lineSets[0]);
            if (anchor) {
              const anchorXY = transformExportPoint(anchor[0], anchor[1], projectionCode, sourceDatumFamily, transformContext);
              if (anchorXY) {
                entities += buildDxfTextEntity(
                  layerName,
                  anchorXY.x,
                  anchorXY.y,
                  labelText,
                  textHeight
                );
              }
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
                return transformExportPoint(lng, lat, projectionCode, sourceDatumFamily, transformContext);
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
              const anchorXY = transformExportPoint(anchor[0], anchor[1], projectionCode, sourceDatumFamily, transformContext);
              if (anchorXY) {
                entities += buildDxfTextEntity(
                  layerName,
                  anchorXY.x,
                  anchorXY.y,
                  labelText,
                  textHeight
                );
              }
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
    if (!exportGeometryRef.current) {
      setExportWarning("Draw a fence first.");
      return;
    }

    const selectedLayers =
      exportFormat === "csv"
        ? visibleExportableLayers.filter(
            (layer) =>
              (layer.type === "point" || layer.data?.csvGeometry === "line") &&
              (layer.data?.exportFormats || []).includes("csv")
          )
        : visibleExportableLayers.filter((layer) =>
            (layer.data?.exportFormats || []).includes("dxf")
          );

    if (!selectedLayers.length) {
      setExportWarning(
        exportFormat === "csv"
          ? "Turn on at least one visible CSV-supported layer first."
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
            Math.min(EXPORT_PAGE_SIZE, layer.data?.maxFeatures || EXPORT_PAGE_SIZE),
            {
              outFields: layer.data?.exportOutFields || layer.data?.outFields,
            }
          );
          const stillVisible = (layersRef.current || []).some(
            (currentLayer) => currentLayer.id === layer.id && currentLayer.visible
          );
          if (!stillVisible) {
            return {
              layer,
              sourceDatumFamily: getLayerExportSourceDatumFamily(layer),
              featureCollection: { type: "FeatureCollection", features: [] },
            };
          }

          return {
            layer,
            sourceDatumFamily: getLayerExportSourceDatumFamily(layer),
            featureCollection: prepareLayerExportFeatureCollection(raw, layer),
          };
        })
      );

      const filename = buildExportFilename(exportFormat, exportProjection);
      const transformContext = await prepareExportTransformContext(collections, exportProjection, exportFormat);

      if (exportFormat === "csv") {
        const csvText = buildCombinedPointCsv(collections, exportProjection, transformContext);
        downloadBlob(
          new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
          filename
        );
      } else {
        const dxfText = buildDxfFromCollections(collections, exportProjection, transformContext);
        downloadBlob(
          new Blob([dxfText], { type: "application/dxf;charset=utf-8;" }),
          filename
        );
      }

            setExportWarning(
              transformContext.usingBrowserFallback
                ? `Export complete: ${filename}. ${transformContext.fallbackWarning || GDA2020_GRID_FALLBACK_WARNING}`
                : `Export complete: ${filename}`
            );
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
    setExportDialogPosition(null);
    exportDialogDragRef.current = null;
    setExportDialogDragging(false);
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
      const hasMrwaRrms = prev.some((l) => l.id === MRWA_RRM_KEY);
      const hasCad = prev.some((l) => l.id === "cad001");
      const hasLGA = prev.some((l) => l.id === "lga233");
      const hasLocalities = prev.some((l) => l.id === "localities234");
      const hasBushfire = prev.some((l) => l.id === "bushfire001");
      const hasZoning = prev.some((l) => l.id === "zoning070");
      const hasSewer = prev.some((l) => l.id === "sewer068");
      const hasSewerMh = prev.some((l) => l.id === "sewer026");
      const hasSewerConnection = prev.some((l) => l.id === "sewer084");
      const hasSewerPressure = prev.some((l) => l.id === "sewer083");
      const hasWaterPipes = prev.some((l) => l.id === "water002");
      const hasWaterMeters = prev.some((l) => l.id === "water006");
      const hasDrainagePits = prev.some((l) => l.id === DRAINAGE_PITS_KEY);
      const hasDrainagePipes = prev.some((l) => l.id === DRAINAGE_PIPES_KEY);
      const hasPowerDistUnderground = prev.some((l) => l.id === "power034");
      const hasPowerDistOverhead = prev.some((l) => l.id === "power031");
      const hasPowerDistPoles = prev.some((l) => l.id === "power029");
      const hasPowerTransmissionUnderground = prev.some((l) => l.id === "power035");
      const hasPowerTransmissionOverhead = prev.some((l) => l.id === "power032");
      const hasPowerTransmissionPoles = prev.some((l) => l.id === "power030");
      const hasPowerNcmt = prev.some((l) => l.id === "power051");
      const hasProjectGrid = prev.some((l) => l.id === LGATE_214_PROJECT_GRID_KEY);
      const hasDistricts = prev.some((l) => l.id === LGATE_229_DISTRICTS_KEY);
      const hasMrwaProjectZones = prev.some((l) => l.id === MRWA_PROJECT_ZONES_KEY);
      const hasRoadsNetwork = prev.some((l) => l.id === MRWA_ROADS_NETWORK_KEY);
      const existingLayerIds = new Set(prev.map((l) => l.id));
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
	      exportSourceDatum: "GDA94",
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
	      exportSourceDatum: "GDA94",
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
	      exportSourceDatum: "GDA94",
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

if (!hasMrwaRrms)
  next.push({
    id: MRWA_RRM_KEY,
    name: MRWA_RRM_NAME,
    type: "point",
    visible: false,
    data: {
      url: MRWA_RRM_QUERY,
      where: MRWA_RRM_WHERE,
      outFields: MRWA_RRM_OUT_FIELDS,
      minZoom: MIN_GEODETIC_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      symbol: mrwaRrmTriangleSymbol,
      layerTag: "MRWA RRM",
      idFields: ["OBJECTID"],
      nameFields: ["MarkName"],
      label: {
        minZoom: SHOW_LABELS_ZOOM,
        color: "#ffffff",
        fontSize: "10px",
        fontWeight: "700",
      },
      filterFn: isMrwaRrmFeature,
      popupBuilder: ({ props }) =>
        buildMrwaRrmPopupHtml({
          props,
        }),
      exportable: true,
      exportFormats: ["csv", "dxf"],
      exportSourceDatum: "GDA94",
      exportOutFields: MRWA_RRM_EXPORT_FIELDS,
      exportAttributeFields: ["MarkName"],
      exportDedupeFields: ["OBJECTID"],
      outputLayerName: "MRWA_RRM",
      dxfLabelFields: ["MarkName"],
    },
  });

if (!hasDrainagePits)
  next.push({
    id: DRAINAGE_PITS_KEY,
    name: DRAINAGE_PITS_NAME,
    type: "point",
    visible: false,
    data: {
      url: DRAINAGE_PITS_QUERY,
      where: "1=1",
      outFields: DRAINAGE_PITS_OUT_FIELDS,
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: DRAINAGE_PITS_MAX_FEATURES_PER_VIEW,
      paginate: true,
      pageSize: DRAINAGE_PITS_QUERY_PAGE_SIZE,
      symbol: {
        path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
        fillColor: "#2E7D32",
        fillOpacity: 1,
        strokeColor: "#0B3D16",
        strokeWeight: 1.5,
        scale: 4.5,
      },
      layerTag: "DRAINAGE PIT",
      exportable: true,
      exportFormats: ["csv", "dxf"],
      exportOutFields: DRAINAGE_PITS_OUT_FIELDS,
      exportAttributeFields: ["Pit_Type"],
      exportDedupeFields: ["OBJECTID"],
      csvLayerName: "Drainage Pit",
      outputLayerName: "DRAINAGE_PITS",
      dxfLabelFields: ["Pit_Type"],
      exportFieldOrder: ["Pit_Type", "OBJECTID"],
      idFields: ["OBJECTID"],
      nameFields: ["Pit_Type"],
      label: null,
      filterFn: () => true,
      popupBuilder: ({ props }) => buildDrainagePitPopupHtml({ props }),
      cluster: false,
    },
  });
if (!hasDrainagePipes)
  next.push({
    id: DRAINAGE_PIPES_KEY,
    name: DRAINAGE_PIPES_NAME,
    type: "line",
    visible: false,
    data: {
      url: DRAINAGE_PIPES_QUERY,
      where: "1=1",
      outFields: DRAINAGE_PIPES_OUT_FIELDS,
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: DRAINAGE_PIPES_MAX_FEATURES_PER_VIEW,
      paginate: true,
      pageSize: DRAINAGE_PIPES_QUERY_PAGE_SIZE,
      orderByFields: "OBJECTID",
      exportable: true,
      exportFormats: ["csv", "dxf"],
      exportSourceDatum: "GDA94",
      exportOutFields: DRAINAGE_PIPES_OUT_FIELDS,
      exportAttributeFields: [],
      exportDedupeFields: ["OBJECTID"],
      csvGeometry: "line",
      csvLayerName: "Drainage Pipe",
      outputLayerName: "DRAINAGE_PIPES",
      dxfLabelFields: [],
      exportFieldOrder: [],
      idFields: ["OBJECTID"],
      style: {
        clickable: false,
        strokeColor: "#2E7D32",
        strokeWeight: 3,
        strokeOpacity: 0.6,
      },
    },
  });
if (!hasPowerDistUnderground)
  next.push({
    id: "power034",
    name: "Distribution Underground Cables (WP-034)",
    type: "line",
    visible: false,
    data: {
      url: WP_034_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Distribution_Underground_Cables",
      style: {
        clickable: false,
        strokeColor: "#d32f2f",
        strokeWeight: 3,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeColor: "#d32f2f",
              strokeOpacity: 1,
              scale: 3,
            },
            offset: "0",
            repeat: "20px",
          },
        ],
      },
    },
  });

if (!hasPowerDistOverhead)
  next.push({
    id: "power031",
    name: "Distribution Overhead Powerlines (WP-031)",
    type: "line",
    visible: false,
    data: {
      url: WP_031_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Distribution_Overhead_Powerlines",
      style: {
        clickable: false,
        strokeColor: "#d32f2f",
        strokeWeight: 3,
        strokeOpacity: 0.65,
      },
    },
  });

if (!hasPowerDistPoles)
  next.push({
    id: "power029",
    name: "Distribution Poles (WP-029)",
    type: "point",
    visible: false,
    data: {
      url: WP_029_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      symbol: {
        path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
        fillColor: "#d32f2f",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1.5,
        scale: 4.5,
      },
      layerTag: "POWER POLE",
      exportable: true,
      exportFormats: ["csv", "dxf"],
      idFields: ["assetid", "asset_id", "poleid", "pole_id", "objectid", "OBJECTID", "fid"],
      nameFields: ["assetid", "asset_id", "poleid", "pole_id", "objectid", "OBJECTID"],
      zFields: [],
      dxfLabelFields: ["assetid", "asset_id", "poleid", "pole_id"],
      exportFieldOrder: ["assetid", "asset_id", "poleid", "pole_id", "objectid", "OBJECTID", "fid"],
      label: null,
      filterFn: (feature) => !isDestroyed(feature?.properties || {}),
      popupBuilder: ({ props }) => {
        const id =
          props?.assetid ||
          props?.asset_id ||
          props?.poleid ||
          props?.pole_id ||
          props?.objectid ||
          props?.OBJECTID;

        return `
          <div style="min-width:160px; font-family:Inter,sans-serif; font-size:13px;">
            <div style="font-weight:800; margin-bottom:6px;">Distribution Pole</div>
            <div><b>ID:</b> ${id ?? "-"}</div>
          </div>
        `;
      },
      cluster: false,
    },
  });

if (!hasPowerTransmissionUnderground)
  next.push({
    id: "power035",
    name: "Transmission Underground Cable (WP-035)",
    type: "line",
    visible: false,
    data: {
      url: WP_035_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Transmission_Underground_Cable",
      style: {
        clickable: false,
        strokeColor: "#f57c00",
        strokeWeight: 3,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeColor: "#f57c00",
              strokeOpacity: 1,
              scale: 3,
            },
            offset: "0",
            repeat: "20px",
          },
        ],
      },
    },
  });

if (!hasPowerTransmissionOverhead)
  next.push({
    id: "power032",
    name: "Transmission Overhead Powerlines (WP-032)",
    type: "line",
    visible: false,
    data: {
      url: WP_032_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Transmission_Overhead_Powerlines",
      style: {
        clickable: false,
        strokeColor: "#f57c00",
        strokeWeight: 3,
        strokeOpacity: 0.65,
      },
    },
  });

if (!hasPowerTransmissionPoles)
  next.push({
    id: "power030",
    name: "Transmission Pole (WP-030)",
    type: "point",
    visible: false,
    data: {
      url: WP_030_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      symbol: {
        path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
        fillColor: "#f57c00",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1.5,
        scale: 4.5,
      },
      layerTag: "TRANSMISSION POLE",
      exportable: true,
      exportFormats: ["csv", "dxf"],
      idFields: ["assetid", "asset_id", "poleid", "pole_id", "objectid", "OBJECTID", "fid"],
      nameFields: ["assetid", "asset_id", "poleid", "pole_id", "objectid", "OBJECTID"],
      zFields: [],
      dxfLabelFields: ["assetid", "asset_id", "poleid", "pole_id"],
      exportFieldOrder: ["assetid", "asset_id", "poleid", "pole_id", "objectid", "OBJECTID", "fid"],
      label: null,
      filterFn: (feature) => !isDestroyed(feature?.properties || {}),
      popupBuilder: ({ props }) => {
        const id =
          props?.assetid ||
          props?.asset_id ||
          props?.poleid ||
          props?.pole_id ||
          props?.objectid ||
          props?.OBJECTID;

        return `
          <div style="min-width:160px; font-family:Inter,sans-serif; font-size:13px;">
            <div style="font-weight:800; margin-bottom:6px;">Transmission Pole</div>
            <div><b>ID:</b> ${id ?? "-"}</div>
          </div>
        `;
      },
      cluster: false,
    },
  });

if (!hasPowerNcmt)
  next.push({
    id: "power051",
    name: "NCMT High Voltage Overhead Transmission Lines (WP-051)",
    type: "line",
    visible: false,
    data: {
      url: WP_051_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "NCMT_High_Voltage_Overhead_Transmission_Lines",
      style: {
        clickable: false,
        strokeColor: "#795548",
        strokeWeight: 3,
        strokeOpacity: 0.7,
      },
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

if (!hasSewerConnection)
  next.push({
    id: "sewer084",
    name: "Sewer Connections (WCORP-084)",
    type: "line",
    visible: false,
    data: {
      url: WCORP_084_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Sewer_Connections",
      style: {
        clickable: false,
        strokeColor: "#ff4da6",
        strokeWeight: 3,
        strokeOpacity: 0.6,
      },
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
infoFields: [],
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
            minZoom: 9,
            maxFeatures: MAX_FEATURES_PER_VIEW,
            style: {
              clickable: false,
              strokeColor: "#2e7d32",
              strokeWeight: 1.5,
              fillColor: "#a5d6a7",
              fillOpacity: 0.25,
            },
labels: {
  minZoom: 12,
  fields: ["name", "lga_name", "local_government_authority"],
  color: "#1b5e20",
  fontWeight: "800",
  fontSize: (zoom) => (zoom >= 14 ? "13px" : zoom >= 11 ? "11px" : "10px"),
  repeatAtZoom: 15,
  repeatOffset: { lat: 0.006, lng: 0.006 },
  repeatGrid: true,
  maxLabels: 120,
  mobileMinZoom: 15,
  mobileMaxLabels: 35,
  disableRepeatGridOnMobile: true,
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
  minZoom: 9,
  fields: ["name", "locality", "locality_name"],
  color: "#0d47a1",
  fontWeight: "800",
  fontSize: (zoom) => (zoom >= 14 ? "13px" : zoom >= 11 ? "11px" : "10px"),
  repeatAtZoom: 14,
  repeatOffset: { lat: 0.0025, lng: 0.0025 },
  repeatGrid: true,
},
      infoFields: [
        { key: "name", label: "Locality" },
        { key: "postcode", label: "Postcode" },
      ],
    },
  });
      if (!hasBushfire)
        next.push({
          id: "bushfire001",
          name: "Bush Fire Prone Areas (OBRM-001)",
          type: "polygon",
          visible: false,
          data: {
            url: OBRM_001_QUERY,
            where: "1=1",
            minZoom: 8,
            maxFeatures: MAX_FEATURES_PER_VIEW,
            style: () => ({
              clickable: true,
              cursor: infoModeRef.current ? "help" : "default",
              strokeColor: "#ef6c00",
              strokeWeight: 1.1,
              strokeOpacity: 0.75,
              fillColor: "#ff9800",
              fillOpacity: 0.16,
            }),
            labels: null,
            exportable: true,
            exportFormats: ["dxf"],
            dxfLabelFields: ["designation"],
            outputLayerName: "Bush_Fire_Prone_Areas",
            infoFields: [
              { key: "designation", label: "Bush fire prone classification" },
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

  if (!hasSewerPressure)
  next.push({
    id: "sewer083",
    name: "Sewer Pressure Main (WCORP-083)",
    type: "line",
    visible: false,
    data: {
      url: WCORP_083_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Sewer_Pressure_Main",
     style: {
  clickable: false,
  strokeColor: "#ff4da6",
  strokeWeight: 3,
  strokeOpacity: 0,
  icons: [
    {
      icon: {
        path: "M 0,-1 0,1",
        strokeColor: "#ff4da6",
        strokeOpacity: 1,
        scale: 3,
      },
      offset: "0",
      repeat: "20px",
    },
  ],
},
    },
  });

if (!hasWaterPipes)
  next.push({
    id: "water002",
    name: "Water Pipes (WCORP-002)",
    type: "line",
    visible: false,
    data: {
      url: WCORP_002_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      exportable: true,
      exportFormats: ["dxf"],
      dxfLabelFields: [],
      outputLayerName: "Water_Pipes",
      style: {
        clickable: false,
        strokeColor: "#4fc3f7",
        strokeWeight: 3,
        strokeOpacity: 0.65,
      },
    },
  });

if (!hasWaterMeters)
  next.push({
    id: "water006",
    name: "Water Meters (WCORP-006)",
    type: "point",
    visible: false,
    data: {
      url: WCORP_006_QUERY,
      where: "1=1",
      minZoom: MIN_CADASTRE_ZOOM,
      maxFeatures: MAX_FEATURES_PER_VIEW,
      clickable: false,
      symbol: {
        path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
        fillColor: "#4fc3f7",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        scale: 3.5,
      },
      layerTag: "WATER METER",
      exportable: true,
      exportFormats: ["csv", "dxf"],
      idFields: ["id", "metering_point_number", "objectid", "OBJECTID", "fid"],
      nameFields: ["id", "metering_point_number"],
      dxfLabelFields: [],
      exportFieldOrder: [
        "id",
        "metering_point_number",
        "address",
        "street_name",
        "suburb_name",
        "objectid",
      ],
      label: null,
      filterFn: (feature) => !isDestroyed(feature?.properties || {}),
      cluster: false,
    },
  });

if (!hasProjectGrid)
  next.push({
    id: LGATE_214_PROJECT_GRID_KEY,
    name: LGATE_214_PROJECT_GRID_NAME,
    type: "imageOverlay",
    visible: false,
    data: {
      mapServerUrl: LGATE_214_PROJECT_GRID_MAPSERVER,
      layerId: LGATE_214_PROJECT_GRID_LAYER_ID,
      opacity: 0.8,
      identifyTolerance: LGATE_214_PROJECT_GRID_IDENTIFY_TOLERANCE_PX,
      infoFields: ["projection", "proj_id"],
    },
  });

if (!hasDistricts)
  next.push({
    id: LGATE_229_DISTRICTS_KEY,
    name: LGATE_229_DISTRICTS_NAME,
    type: "imageOverlay",
    visible: false,
    data: {
      mapServerUrl: LGATE_BOUNDARIES_MAPSERVER,
      layerId: LGATE_229_DISTRICTS_LAYER_ID,
      opacity: 1,
      identifyTolerance: LGATE_229_DISTRICTS_IDENTIFY_TOLERANCE_PX,
      nameField: LGATE_229_DISTRICTS_NAME_FIELD,
      drawingInfo: LGATE_229_DISTRICTS_DRAWING_INFO,
    },
  });

if (!hasRoadsNetwork)
  next.push({
    id: MRWA_ROADS_NETWORK_KEY,
    name: MRWA_ROADS_NETWORK_NAME,
    type: "imageOverlay",
    visible: false,
    data: {
      mapServerUrl: MRWA_ROADS_NETWORK_MAPSERVER,
      layerId: MRWA_ROADS_NETWORK_LAYER_ID,
      opacity: 0.8,
      identifyTolerance: MRWA_ROADS_NETWORK_IDENTIFY_TOLERANCE_PX,
      roadNameField: MRWA_ROADS_NETWORK_ROAD_NAME_FIELD,
      drawingInfo: MRWA_ROADS_NETWORK_DRAWING_INFO,
    },
  });

if (!hasMrwaProjectZones)
  next.push({
    id: MRWA_PROJECT_ZONES_KEY,
    name: MRWA_PROJECT_ZONES_NAME,
    type: "polygon",
    visible: false,
    data: {
      url: MRWA_PROJECT_ZONES_QUERY,
      where: MRWA_PROJECT_ZONES_WHERE,
      outFields: ["OBJECTID", "Name", "Spheroid"],
      geometryPrecision: 6,
      maxFeatures: 2000,
      style: {
        clickable: false,
        strokeColor: "#512DA8",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#7E57C2",
        fillOpacity: 0.18,
      },
      labels: {
        minZoom: 9,
        fields: ["Name"],
        color: "#111111",
        fontWeight: "800",
        fontSize: (zoom) => (zoom >= 10 ? "12px" : "10px"),
        maxLabels: 80,
        mobileMinZoom: 9,
        mobileMaxLabels: 35,
      },
      filterFn: isRenderableMrwaProjectZoneFeature,
      infoFields: [
        { key: "Name", label: "Project Zone" },
      ],
    },
  });

DPIRD_CONTOUR_LAYER_CONFIGS.forEach((config) => {
  if (existingLayerIds.has(config.key)) return;
  next.push({
    id: config.key,
    name: config.name,
    type: "imageOverlay",
    visible: false,
    data: {
      mapServerUrl: DPIRD_CONTOURS_MAPSERVER,
      layerId: config.layerId,
      opacity: config.opacity,
      identifyTolerance: DPIRD_CONTOUR_IDENTIFY_TOLERANCE_PX,
      elevationField: config.elevationField,
      interval: config.interval,
      priority: config.priority,
      drawingInfo: config.drawingInfo,
    },
  });
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
  let cancelled = false;

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
          layer.data.where || "1=1",
          {
            outFields: layer.data?.outFields,
            geometryPrecision: layer.data?.geometryPrecision,
            maxAllowableOffset: layer.data?.maxAllowableOffset,
            paginate: layer.data?.paginate,
            pageSize: layer.data?.pageSize,
            orderByFields: layer.data?.orderByFields,
          }
        );
        if (cancelled) return;

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

if (layer.data?.clickable !== false) {
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

    maybeLoadPopupPcg2020({ layer, name, props, lat, lng, markerId: id });
  });
}

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
        if (cancelled) return;
        console.warn(`${layer.name} fetch failed:`, err);
        clearLayer(store);
      }
    }

    if (cancelled) return;

    if (totalVisible === 0 && pointLayers.some((l) => l.visible && (zoom ?? 0) < (l.data?.minZoom ?? 0))) {
      setGeodeticNotice(`Zoom to ${MIN_GEODETIC_ZOOM}+ to see geodetic marks.`);
    } else {
      setGeodeticNotice("");
    }

    syncClusterer();
  };

  run();

const staleTimer = setInterval(() => {
  if (cancelled) return;
  const anyVisible = pointLayers.some((l) => l.visible);
  if (!anyVisible) return;

  // Don’t refresh point layers while a point popup is open
  if (mainInfoOpenRef.current) return;

  setViewTick((t) => t + 1);
}, STALE_REFRESH_MS);

  return () => {
    cancelled = true;
    clearInterval(staleTimer);
  };
}, [layers, viewTick, isAppVisible]);

    // ✅ Shared polygon layer loader (cadastre, LGA, zoning, future polygon layers)
  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;
    if (!isAppVisible) return;
    let cancelled = false;

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

        if (layer.id === "bushfire001") {
          polygons.addListener("click", (e) => {
            if (!infoModeRef.current) return;
            openMapInfoPopupAtLatLng(e?.latLng);
          });
        }

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
            layer.data.where || "1=1",
            {
              outFields: layer.data?.outFields,
              geometryPrecision: layer.data?.geometryPrecision,
              maxAllowableOffset: layer.data?.maxAllowableOffset,
            }
          );
          if (cancelled) return;

          if (layer.id === "bushfire001") {
            const firstFeature = geojson.features?.[0];
            console.log("Bush Fire layer fetch", {
              requestUrl: geojson.requestUrl || layer.data.url,
              featureCount: geojson.features?.length || 0,
              firstFeatureAttributes: firstFeature?.properties || null,
              firstFeatureHasGeometry: !!firstFeature?.geometry,
            });
          }

          if (typeof layer.data?.filterFn === "function") {
            geojson.features = (geojson.features || []).filter(layer.data.filterFn);
          }

          const maxFeatures = layer.data?.maxFeatures ?? MAX_FEATURES_PER_VIEW;
          if ((geojson.features?.length || 0) > maxFeatures) {
            console.warn(`${layer.name}: too many features in view, zoom in further.`);
            clearLayer(store);
            continue;
          }

          clearLayer(store);
          if (cancelled) return;
          store.polygons.addGeoJson(geojson);

          const labelCfg = layer.data?.labels;
          if (!labelCfg) continue;
          const isMobileDevice =
            typeof window !== "undefined" && window.innerWidth <= 900;
          const labelMinZoom =
            isMobileDevice && Number.isFinite(labelCfg.mobileMinZoom)
              ? labelCfg.mobileMinZoom
              : labelCfg.minZoom ?? 999;
          const maxLabels =
            isMobileDevice && Number.isFinite(labelCfg.mobileMaxLabels)
              ? labelCfg.mobileMaxLabels
              : labelCfg.maxLabels ?? Infinity;
          if ((zoom ?? 0) < labelMinZoom) continue;
          if (maxLabels <= 0) continue;

          const nextLabels = [];
          const polygonFeatures = [];
          store.polygons.forEach((feature) => polygonFeatures.push(feature));

          for (const feature of polygonFeatures) {
            if (nextLabels.length >= maxLabels) break;

            const text = getPolygonLabelText(feature, labelCfg.fields || []);
            const center = getCentroidFromGoogleGeometry(feature.getGeometry(), googleMaps);
            if (!center || !text) continue;

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
            if (nextLabels.length >= maxLabels) break;

     

 if (
  labelCfg.repeatAtZoom &&
  (zoom ?? 0) >= labelCfg.repeatAtZoom &&
  !(isMobileDevice && labelCfg.disableRepeatGridOnMobile)
) {
  const latOffset = labelCfg.repeatOffset?.lat ?? 0;
  const lngOffset = labelCfg.repeatOffset?.lng ?? 0;

  if (labelCfg.repeatGrid) {
    const featureBounds = new googleMaps.LatLngBounds();

    const walkGeometry = (geometry) => {
      if (!geometry) return;

      const type = geometry.getType();

      if (type === "Point") {
        featureBounds.extend(geometry.get());
      } else if (type === "MultiPoint" || type === "LineString" || type === "LinearRing") {
        geometry.getArray().forEach((latLng) => featureBounds.extend(latLng));
      } else if (
        type === "MultiLineString" ||
        type === "Polygon" ||
        type === "MultiPolygon"
      ) {
        geometry.getArray().forEach((part) => walkGeometry(part));
      }
    };

    walkGeometry(feature.getGeometry());

    if (!featureBounds.isEmpty() && latOffset && lngOffset) {
      const sw = featureBounds.getSouthWest();
      const ne = featureBounds.getNorthEast();

      for (let lat = sw.lat() + latOffset; lat < ne.lat(); lat += latOffset) {
        for (let lng = sw.lng() + lngOffset; lng < ne.lng(); lng += lngOffset) {
          if (nextLabels.length >= maxLabels) break;

          const pos = new googleMaps.LatLng(lat, lng);

          if (
            googleMaps.geometry?.poly?.containsLocation &&
            dataPolygonFeatureContainsLatLng(feature, pos, googleMaps)
          ) {
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
          }
        }
        if (nextLabels.length >= maxLabels) break;
      }
    }
  } else {
    if (nextLabels.length >= maxLabels) continue;

    const pos = new googleMaps.LatLng(
      center.lat() + latOffset,
      center.lng() + lngOffset
    );

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
  }
}
          }

          store.labels = nextLabels;
        } catch (err) {
          if (cancelled) return;
          console.warn(`${layer.name} fetch failed:`, err);
          clearLayer(store);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [layers, viewTick, isAppVisible]);
  
// ---------- Shared line layer loader ----------
useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  if (!map || !googleMaps) return;
  if (!isAppVisible) return;
  let cancelled = false;

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
          layer.data.where || "1=1",
          {
            outFields: layer.data?.outFields,
            geometryPrecision: layer.data?.geometryPrecision,
            maxAllowableOffset: layer.data?.maxAllowableOffset,
            paginate: layer.data?.paginate,
            pageSize: layer.data?.pageSize,
            orderByFields: layer.data?.orderByFields,
          }
        );
        if (cancelled) return;

        const preparedGeojson = dedupeFeatureCollectionForExport(geojson, layer);
        const maxFeatures = layer.data?.maxFeatures ?? MAX_FEATURES_PER_VIEW;
        if ((preparedGeojson.features?.length || 0) > maxFeatures) {
          console.warn(`${layer.name}: too many features in view, zoom in further.`);
          clearLayer(store);
          continue;
        }

        clearLayer(store);
        if (cancelled) return;
        store.lines.addGeoJson(preparedGeojson);
      } catch (err) {
        if (cancelled) return;
        console.warn(`${layer.name} fetch failed:`, err);
        clearLayer(store);
      }
    }
  };

  run();
  return () => {
    cancelled = true;
  };
}, [layers, viewTick, isAppVisible]);

const projectGridLayer = useMemo(
  () => layers.find((l) => l.id === LGATE_214_PROJECT_GRID_KEY),
  [layers]
);
const districtsLayer = useMemo(
  () => layers.find((l) => l.id === LGATE_229_DISTRICTS_KEY),
  [layers]
);
const roadsNetworkLayer = useMemo(
  () => layers.find((l) => l.id === MRWA_ROADS_NETWORK_KEY),
  [layers]
);
const mrwaProjectZonesLayer = useMemo(
  () => layers.find((l) => l.id === MRWA_PROJECT_ZONES_KEY),
  [layers]
);

useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  const layer = projectGridLayer;

  const removeOverlay = () => {
    if (!projectGridOverlayRef.current) return;
    try {
      projectGridOverlayRef.current.setMap(null);
    } catch {
      // ignore
    }
    projectGridOverlayRef.current = null;
  };

  if (!map || !googleMaps || !isAppVisible || !layer?.visible) {
    contourIdentifySeqRef.current += 1;
    removeOverlay();
    return undefined;
  }

  const bounds = viewRef.current?.bounds || map.getBounds();
  const mapDiv = mapDivRef.current;
  const { width, height } = getMapImageSize(mapDiv);
  const url = buildArcgisMapServerExportUrl({
    serviceUrl: layer.data?.mapServerUrl || LGATE_214_PROJECT_GRID_MAPSERVER,
    bounds,
    width,
    height,
    layerId: layer.data?.layerId,
  });

  removeOverlay();
  if (!bounds || !url) return undefined;

  projectGridOverlayRef.current = new googleMaps.GroundOverlay(url, bounds, {
    clickable: false,
    opacity: layer.data?.opacity ?? 0.8,
  });
  projectGridOverlayRef.current.setMap(map);

  return () => {
    removeOverlay();
  };
}, [projectGridLayer, viewTick, isAppVisible]);

useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  const layer = districtsLayer;

  const removeOverlay = () => {
    if (!districtsOverlayRef.current) return;
    try {
      districtsOverlayRef.current.setMap(null);
    } catch {
      // ignore
    }
    districtsOverlayRef.current = null;
  };

  if (!map || !googleMaps || !isAppVisible || !layer?.visible) {
    contourIdentifySeqRef.current += 1;
    removeOverlay();
    return undefined;
  }

  const bounds = viewRef.current?.bounds || map.getBounds();
  const mapDiv = mapDivRef.current;
  const { width, height } = getMapImageSize(mapDiv);
  const url = buildArcgisMapServerExportUrl({
    serviceUrl: layer.data?.mapServerUrl || LGATE_BOUNDARIES_MAPSERVER,
    bounds,
    width,
    height,
    layerId: layer.data?.layerId,
    drawingInfo: layer.data?.drawingInfo,
  });

  removeOverlay();
  if (!bounds || !url) return undefined;

  districtsOverlayRef.current = new googleMaps.GroundOverlay(url, bounds, {
    clickable: false,
    opacity: layer.data?.opacity ?? 1,
  });
  districtsOverlayRef.current.setMap(map);

  return () => {
    removeOverlay();
  };
}, [districtsLayer, viewTick, isAppVisible]);

useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  const layer = roadsNetworkLayer;

  const removeOverlay = () => {
    if (!roadsNetworkOverlayRef.current) return;
    try {
      roadsNetworkOverlayRef.current.setMap(null);
    } catch {
      // ignore
    }
    roadsNetworkOverlayRef.current = null;
  };

  if (!map || !googleMaps || !isAppVisible || !layer?.visible) {
    contourIdentifySeqRef.current += 1;
    removeOverlay();
    return undefined;
  }

  const bounds = viewRef.current?.bounds || map.getBounds();
  const mapDiv = mapDivRef.current;
  const { width, height } = getMapImageSize(mapDiv);
  const url = buildArcgisMapServerExportUrl({
    serviceUrl: layer.data?.mapServerUrl || MRWA_ROADS_NETWORK_MAPSERVER,
    bounds,
    width,
    height,
    layerId: layer.data?.layerId,
    drawingInfo: layer.data?.drawingInfo,
  });

  removeOverlay();
  if (!bounds || !url) return undefined;

  roadsNetworkOverlayRef.current = new googleMaps.GroundOverlay(url, bounds, {
    clickable: false,
    opacity: layer.data?.opacity ?? 0.8,
  });
  roadsNetworkOverlayRef.current.setMap(map);

  return () => {
    removeOverlay();
  };
}, [roadsNetworkLayer, viewTick, isAppVisible]);

const contourLayers = useMemo(
  () =>
    DPIRD_CONTOUR_LAYER_CONFIGS.map((config) => layers.find((l) => l.id === config.key)).filter(Boolean),
  [layers]
);

useEffect(() => {
  const map = mapRef.current;
  const googleMaps = window.google?.maps;
  const activeContourLayers = contourLayers.filter((layer) => layer.visible);

  const removeOverlay = (layerId) => {
    const overlay = contourOverlaysRef.current.get(layerId);
    if (!overlay) return;
    try {
      overlay.setMap(null);
    } catch {
      // ignore
    }
    contourOverlaysRef.current.delete(layerId);
  };

  const removeAllOverlays = () => {
    Array.from(contourOverlaysRef.current.keys()).forEach(removeOverlay);
  };

  if (!map || !googleMaps || !isAppVisible || !activeContourLayers.length) {
    contourIdentifySeqRef.current += 1;
    removeAllOverlays();
    return undefined;
  }

  const activeIds = new Set(activeContourLayers.map((layer) => layer.id));
  Array.from(contourOverlaysRef.current.keys()).forEach((layerId) => {
    if (!activeIds.has(layerId)) removeOverlay(layerId);
  });

  const bounds = viewRef.current?.bounds || map.getBounds();
  const mapDiv = mapDivRef.current;
  const { width, height } = getMapImageSize(mapDiv);

  activeContourLayers
    .slice()
    .sort((a, b) => (a.data?.interval || 0) - (b.data?.interval || 0))
    .forEach((layer) => {
      removeOverlay(layer.id);
      const url = buildArcgisMapServerExportUrl({
        serviceUrl: layer.data?.mapServerUrl || DPIRD_CONTOURS_MAPSERVER,
        bounds,
        width,
        height,
        layerId: layer.data?.layerId,
        drawingInfo: layer.data?.drawingInfo,
      });
      if (!bounds || !url) return;

      const overlay = new googleMaps.GroundOverlay(url, bounds, {
        clickable: false,
        opacity: layer.data?.opacity ?? 0.8,
      });
      contourOverlaysRef.current.set(layer.id, overlay);
      overlay.setMap(map);
    });

  return () => {
    removeAllOverlays();
  };
}, [contourLayers, viewTick, isAppVisible]);

  const toggleLayer = (id) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  const cadLayer = useMemo(() => layers.find((l) => l.id === "cad001"), [layers]);
  const ssmLayer = useMemo(() => layers.find((l) => l.id === "ssm076"), [layers]);
  const bmLayer = useMemo(() => layers.find((l) => l.id === "bm076"), [layers]);
  const rmLayer = useMemo(() => layers.find((l) => l.id === "rm199"), [layers]);
  const mrwaRrmLayer = useMemo(() => layers.find((l) => l.id === MRWA_RRM_KEY), [layers]);

  const geodeticAnyOn = !!(
    ssmLayer?.visible ||
    bmLayer?.visible ||
    rmLayer?.visible ||
    mrwaRrmLayer?.visible
  );

  const toggleGeodeticAll = () => {
    const next = !geodeticAnyOn;
    setLayers((prev) =>
      prev.map((l) =>
        ["ssm076", "bm076", "rm199", MRWA_RRM_KEY].includes(l.id)
          ? { ...l, visible: next }
          : l
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
    pauseMapActivity();
  };
}, [pauseMapActivity]);

// Stop tracking when app goes into background
useEffect(() => {
  if (!isAppVisible) {
    pauseMapActivity();
  }
}, [isAppVisible, pauseMapActivity]);

useEffect(() => {
  if (typeof window === "undefined") return undefined;

  const handleVisibilityPause = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      pauseMapActivity();
    } else {
      attachAddressAutocomplete(true);
    }
  };
  const handleResume = () => {
    attachAddressAutocomplete(true);
  };

  window.__pwMapsPrepareExternalNav = pauseMapActivity;
  document.addEventListener("visibilitychange", handleVisibilityPause);
  window.addEventListener("pagehide", pauseMapActivity);
  window.addEventListener("pageshow", handleResume);
  window.addEventListener("blur", pauseMapActivity);
  window.addEventListener("focus", handleResume);

  return () => {
    if (window.__pwMapsPrepareExternalNav === pauseMapActivity) {
      delete window.__pwMapsPrepareExternalNav;
    }
    document.removeEventListener("visibilitychange", handleVisibilityPause);
    window.removeEventListener("pagehide", pauseMapActivity);
    window.removeEventListener("pageshow", handleResume);
    window.removeEventListener("blur", pauseMapActivity);
    window.removeEventListener("focus", handleResume);
  };
}, [attachAddressAutocomplete, pauseMapActivity]);

useEffect(() => {
  const node = mapDivRef.current;
  if (!node) return;

  let frame = null;
  const resizeMap = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map || !window.google?.maps) return;
      window.google.maps.event.trigger(map, "resize");
      viewRef.current = { bounds: map.getBounds(), zoom: map.getZoom() };
      setViewTick((t) => t + 1);
    });
  };

  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeMap) : null;

  observer?.observe(node);
  window.addEventListener("resize", resizeMap);
  resizeMap();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener("resize", resizeMap);
  };
}, []);

return (
    <div className="maps-fullscreen">
      <div className="maps-topbar" style={{ height: TOP_BAR_HEIGHT }}>
        <div className="maps-title-group">
          <span className="maps-title">Maps</span>
          <span className="maps-subtitle">
            Search jobs or any street address, zoom, and navigate
          </span>
        </div>

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
              ref={exportDialogRef}
              style={{
                width: "min(560px, 100%)",
                background: "#fff",
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: "0 18px 36px rgba(0,0,0,0.22)",
                padding: 16,
                maxHeight: isMobile ? "calc(100vh - 84px)" : "calc(100vh - 40px)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                ...(exportDialogPosition && !isMobile
                  ? {
                      position: "fixed",
                      left: exportDialogPosition.left,
                      top: exportDialogPosition.top,
                      zIndex: 16,
                    }
                  : null),
              }}
            >
              <div
                onPointerDown={handleExportDialogHeaderPointerDown}
                onPointerMove={handleExportDialogHeaderPointerMove}
                onPointerUp={endExportDialogDrag}
                onPointerCancel={endExportDialogDrag}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                  cursor: isMobile ? "default" : exportDialogDragging ? "grabbing" : "grab",
                  userSelect: exportDialogDragging ? "none" : undefined,
                  touchAction: "none",
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
                  overflowY: "auto",
                  minHeight: 0,
                  paddingRight: 2,
                }}
              >
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
                  {getProjectionDatumFamily(exportProjection) === "GDA2020" && !EXPORT_TRANSFORM_SERVICE_ENDPOINT ? (
                    <span style={{ fontSize: 11, color: "#8a5a00", fontWeight: 750 }}>
                      {GDA2020_GRID_FALLBACK_WARNING}
                    </span>
                  ) : null}
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
                  CSV will include visible point layers and supported line layers inside the fence.
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
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid rgba(0,0,0,0.08)",
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
                    onFocus={() => attachAddressAutocomplete(true)}
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
                        {jobNumberSuggestions.map((job, idx) => {
                          const addressState = getJobAddressWarning(job);
                          return (
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
                                className={addressState.label ? "manual-address-warning" : ""}
                                style={{
                                  fontWeight: 700,
                                  fontSize: 12,
                                  color: "#444",
                                  marginTop: 2,
                                }}
                              >
                                {(job.client_name || "—") + " · " + addressState.displayAddress}
                                {addressState.label && <span className="manual-address-badge">{addressState.label}</span>}
                              </div>
                            </button>
                          );
                        })}
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
                    {[ssmLayer, bmLayer, rmLayer, mrwaRrmLayer, projectGridLayer, mrwaProjectZonesLayer]
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
{/* Drainage */}
<div className="layer-subheading">Drainage</div>
{[DRAINAGE_PITS_KEY, DRAINAGE_PIPES_KEY]
  .map((id) => layers.find((l) => l.id === id))
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

{/* Power */}
<div className="layer-subheading" style={{ marginTop: 8 }}>Power</div>
{[
  "power034",
  "power031",
  "power029",
  "power035",
  "power032",
  "power030",
  "power051",
]
  .map((id) => layers.find((l) => l.id === id))
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

{/* Sewer */}
<div className="layer-subheading" style={{ marginTop: 8 }}>Sewer</div>
{["sewer026", "sewer068", "sewer083", "sewer084"]
  .map((id) => layers.find((l) => l.id === id))
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

{/* Water */}
<div className="layer-subheading" style={{ marginTop: 8 }}>
  Water
</div>
{["water002", "water006"]
  .map((id) => layers.find((l) => l.id === id))
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
                  <div className="maps-layer-section-title">Contours</div>
                  <div className="layers-list">
                    {contourLayers.map((layer) => (
                      <div key={layer.id} className="layer-row layer-row-compact">
                        <label className="layer-left">
                          <input
                            type="checkbox"
                            checked={layer.visible}
                            onChange={() => toggleLayer(layer.id)}
                          />
                          <span className="layer-name">{layer.name}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="maps-layer-section">
                  <div className="maps-layer-section-title">Local Authority</div>
                  <div className="layers-list">
                    {[
                      LGATE_229_DISTRICTS_KEY,
                      "lga233",
                      "localities234",
                    ]
                      .map((id) => layers.find((l) => l.id === id))
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
  <div className="maps-layer-section-title">Planning</div>
  <div className="layers-list">
    {layers
      .filter((l) => ["bushfire001", "zoning070"].includes(l.id))
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
                  <div className="maps-layer-section-title">Roads</div>
                  <div className="layers-list">
                    {[roadsNetworkLayer]
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
                      onChange={(e) => handleShowAllNotesChange(e.target.checked)}
                      style={{ transform: "scale(1.05)" }}
                    />
                    Show All Notes
                  </label>

                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                    {showAllNotes
                      ? "Showing all notes"
                      : portalSelectedJobId
                      ? `Showing notes for job #${selectedPortalJobNumber || "—"}`
                      : "No job selected — notes hidden"}
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
    style={{ background: "transparent", borderTop: "3px dashed #d32f2f", height: 0 }}
  />
  <div>
    <div className="maps-legend-title">Distribution Underground Cables</div>
    <div className="maps-legend-sub">WP-034 (red dashed line)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#d32f2f", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">Distribution Overhead Powerlines</div>
    <div className="maps-legend-sub">WP-031 (red line)</div>
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
      background: "#d32f2f",
      border: "1.5px solid #ffffff",
    }}
  />
  <div>
    <div className="maps-legend-title">Distribution Poles</div>
    <div className="maps-legend-sub">WP-029 (red point)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "transparent", borderTop: "3px dashed #f57c00", height: 0 }}
  />
  <div>
    <div className="maps-legend-title">Transmission Underground Cable</div>
    <div className="maps-legend-sub">WP-035 (orange dashed line)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#f57c00", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">Transmission Overhead Powerlines</div>
    <div className="maps-legend-sub">WP-032 (orange line)</div>
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
      background: "#f57c00",
      border: "1.5px solid #ffffff",
    }}
  />
  <div>
    <div className="maps-legend-title">Transmission Pole</div>
    <div className="maps-legend-sub">WP-030 (orange point)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#795548", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">NCMT High Voltage Overhead Transmission Lines</div>
    <div className="maps-legend-sub">WP-051 (brown line)</div>
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
    style={{ background: "#ff4da6", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">Sewer Connections</div>
    <div className="maps-legend-sub">WCORP-084 (pink sewer connection line)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#ff4da6", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">Sewer Pressure Main</div>
    <div className="maps-legend-sub">WCORP-083 (pink dashed line)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-line"
    style={{ background: "#4fc3f7", height: 3 }}
  />
  <div>
    <div className="maps-legend-title">Water Pipes</div>
    <div className="maps-legend-sub">WCORP-002 (light blue line)</div>
  </div>
</div>

<div className="maps-legend-row">
  <span
    className="maps-legend-swatch"
    style={{
      background: "#4fc3f7",
      width: 8,
      height: 8,
      borderRadius: "50%",
      border: "1px solid #ffffff",
    }}
  />
  <div>
    <div className="maps-legend-title">Water Meters</div>
    <div className="maps-legend-sub">WCORP-006 (small light blue point)</div>
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
                      style={{ background: "#ef6c00", height: 2 }}
                    />
                    <div>
                      <div className="maps-legend-title">Bush Fire Prone Areas</div>
                      <div className="maps-legend-sub">OBRM-001 (orange boundary, light orange transparent fill)</div>
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
