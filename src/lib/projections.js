import proj4 from "proj4";

const STANDARD_PROJECTIONS = {
  "EPSG:7844": {
    label: "GDA2020 Lat/Long",
    group: "GDA2020",
    proj4: "+proj=longlat +ellps=GRS80 +no_defs",
  },
"EPSG:7849": {
  label: "MGA2020 Zone 49",
  group: "GDA2020",
  proj4: "+proj=utm +zone=49 +south +ellps=GRS80 +units=m +no_defs",
},
"EPSG:7850": {
  label: "MGA2020 Zone 50",
  group: "GDA2020",
  proj4: "+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs",
},
"EPSG:7851": {
  label: "MGA2020 Zone 51",
  group: "GDA2020",
  proj4: "+proj=utm +zone=51 +south +ellps=GRS80 +units=m +no_defs",
},
"EPSG:7852": {
  label: "MGA2020 Zone 52",
  group: "GDA2020",
  proj4: "+proj=utm +zone=52 +south +ellps=GRS80 +units=m +no_defs",
},

  "EPSG:4283": {
    label: "GDA94 Lat/Long",
    group: "GDA94",
    proj4: "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",
  },
  "EPSG:28349": {
    label: "MGA94 Zone 49",
    group: "GDA94",
    proj4: "+proj=utm +zone=49 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  "EPSG:28350": {
    label: "MGA94 Zone 50",
    group: "GDA94",
    proj4: "+proj=utm +zone=50 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  "EPSG:28351": {
    label: "MGA94 Zone 51",
    group: "GDA94",
    proj4: "+proj=utm +zone=51 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  "EPSG:28352": {
    label: "MGA94 Zone 52",
    group: "GDA94",
    proj4: "+proj=utm +zone=52 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },

  "EPSG:4203": {
    label: "AGD84 Lat/Long",
    group: "AGD84",
    proj4: "+proj=longlat +datum=AGD84 +no_defs",
  },
  "EPSG:20349": {
    label: "AGD84 Zone 49",
    group: "AGD84",
    proj4: "+proj=utm +zone=49 +south +datum=AGD84 +units=m +no_defs",
  },
  "EPSG:20350": {
    label: "AGD84 Zone 50",
    group: "AGD84",
    proj4: "+proj=utm +zone=50 +south +datum=AGD84 +units=m +no_defs",
  },
  "EPSG:20351": {
    label: "AGD84 Zone 51",
    group: "AGD84",
    proj4: "+proj=utm +zone=51 +south +datum=AGD84 +units=m +no_defs",
  },
  "EPSG:20352": {
    label: "AGD84 Zone 52",
    group: "AGD84",
    proj4: "+proj=utm +zone=52 +south +datum=AGD84 +units=m +no_defs",
  },

  "EPSG:3857": {
    label: "Web Mercator (Google Maps)",
    group: "Other",
    proj4:
      "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs",
  },
  "EPSG:4326": {
    label: "WGS84 Lat/Long",
    group: "Other",
    proj4: "+proj=longlat +datum=WGS84 +no_defs",
  },
};

const LOCAL_GRID_PROJECTIONS = {
  ALB2020: { label: "Albany (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 117.8833333333, k: 1.0000044, x_0: 50000, y_0: 4100000, ellps: "GRS80", units: "m" },
  ALB94:   { label: "Albany (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 117.8833333333, k: 1.0000044, x_0: 50000, y_0: 4000000, ellps: "GRS80", units: "m" },
  ALB84:   { label: "Albany (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 117.9166666667, k: 1.000012,  x_0: 50000, y_0: 4000000, ellps: "aust_SA", units: "m" },

  BIO2020: { label: "Barrow Island–Onslow (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 115.25, k: 1.0000022, x_0: 60000, y_0: 2700000, ellps: "GRS80", units: "m" },
  BIO94:   { label: "Barrow Island–Onslow (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 115.25, k: 1.0000022, x_0: 60000, y_0: 2600000, ellps: "GRS80", units: "m" },

  BRO2020: { label: "Broome (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 122.3333333333, k: 1.00000298, x_0: 50000, y_0: 2300000, ellps: "GRS80", units: "m" },
  BRO94:   { label: "Broome (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 122.3333333333, k: 1.00000298, x_0: 50000, y_0: 2200000, ellps: "GRS80", units: "m" },
  BRO84:   { label: "Broome (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 122.3333333333, k: 1.000003,   x_0: 50000, y_0: 2200000, ellps: "aust_SA", units: "m" },

  BCG2020: { label: "Busselton (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 115.4333333333, k: 0.99999592, x_0: 50000, y_0: 4000000, ellps: "GRS80", units: "m" },
  BCG94:   { label: "Busselton (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 115.4333333333, k: 0.99999592, x_0: 50000, y_0: 3900000, ellps: "GRS80", units: "m" },
  BCG84:   { label: "Busselton (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 115.4333333333, k: 1.000007,   x_0: 50000, y_0: 3900000, ellps: "aust_SA", units: "m" },

  CARN2020:{ label: "Carnarvon (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 113.6666666667, k: 0.99999796, x_0: 50000, y_0: 3050000, ellps: "GRS80", units: "m" },
  CARN94:  { label: "Carnarvon (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 113.6666666667, k: 0.99999796, x_0: 50000, y_0: 2950000, ellps: "GRS80", units: "m" },
  CARN84:  { label: "Carnarvon (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 113.6666666667, k: 1.000005,   x_0: 50000, y_0: 3050000, ellps: "aust_SA", units: "m" },

  CIG2020: { label: "Christmas Island (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 105.625, k: 1.00002514, x_0: 50000, y_0: 1400000, ellps: "GRS80", units: "m" },
  CIG94:   { label: "Christmas Island (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 105.625, k: 1.00002514, x_0: 50000, y_0: 1300000, ellps: "GRS80", units: "m" },
  CIG92:   { label: "Christmas Island (WGS84)",   group: "Other",   proj: "tmerc", lat_0: 0, lon_0: 105.625, k: 1.000024,   x_0: 50000, y_0: 1300000, datum: "WGS84", ellps: "WGS84", units: "m" },

  CKIG2020:{ label: "Cocos Islands (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 96.875, k: 0.99999387, x_0: 50000, y_0: 1600000, ellps: "GRS80", units: "m" },
  CKIG94:  { label: "Cocos Islands (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 96.875, k: 0.99999387, x_0: 50000, y_0: 1500000, ellps: "GRS80", units: "m" },
  CKIG92:  { label: "Cocos Islands (WGS84)",   group: "Other",   proj: "tmerc", lat_0: 0, lon_0: 96.875, k: 1.0,         x_0: 50000, y_0: 1400000, datum: "WGS84", ellps: "WGS84", units: "m" },

  COL2020: { label: "Collie (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 115.9333333333, k: 1.000019, x_0: 40000, y_0: 4100000, ellps: "GRS80", units: "m" },
  COL94:   { label: "Collie (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 115.9333333333, k: 1.000019, x_0: 40000, y_0: 4000000, ellps: "GRS80", units: "m" },

  ESP2020: { label: "Esperance (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 121.8833333333, k: 1.0000055, x_0: 50000, y_0: 4050000, ellps: "GRS80", units: "m" },
  ESP94:   { label: "Esperance (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 121.8833333333, k: 1.0000055, x_0: 50000, y_0: 3950000, ellps: "GRS80", units: "m" },
  ESP84:   { label: "Esperance (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 121.8833333333, k: 1.000012,  x_0: 50000, y_0: 3950000, ellps: "aust_SA", units: "m" },

  EXM2020: { label: "Exmouth (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 114.0666666667, k: 1.00000236, x_0: 50000, y_0: 2750000, ellps: "GRS80", units: "m" },
  EXM94:   { label: "Exmouth (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 114.0666666667, k: 1.00000236, x_0: 50000, y_0: 2650000, ellps: "GRS80", units: "m" },
  EXM84:   { label: "Exmouth (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 114.0666666667, k: 1.000009,   x_0: 60000, y_0: 2750000, ellps: "aust_SA", units: "m" },

  GCG2020: { label: "Geraldton (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 114.5833333333, k: 1.00000628, x_0: 50000, y_0: 3450000, ellps: "GRS80", units: "m" },
  GCG94:   { label: "Geraldton (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 114.5833333333, k: 1.00000628, x_0: 50000, y_0: 3350000, ellps: "GRS80", units: "m" },
  GCG84:   { label: "Geraldton (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 114.6666666667, k: 1.000016,   x_0: 50000, y_0: 3350000, ellps: "aust_SA", units: "m" },

  GOLD2020:{ label: "Goldfields (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 121.5, k: 1.00004949, x_0: 60000, y_0: 3800000, ellps: "GRS80", units: "m" },
  GOLD94:  { label: "Goldfields (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 121.5, k: 1.00004949, x_0: 60000, y_0: 3700000, ellps: "GRS80", units: "m" },
  GG84:    { label: "Goldfields (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 121.45, k: 1.000057,   x_0: 60000, y_0: 4000000, ellps: "aust_SA", units: "m" },

  JCG2020: { label: "Jurien (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 114.9833333333, k: 1.00000314, x_0: 50000.0, y_0: 3650000.0, ellps: "GRS80", units: "m" },
  JCG94:   { label: "Jurien (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 114.9833333333, k: 1.00000314, x_0: 50000.0, y_0: 3550000.0, ellps: "GRS80", units: "m" },
  JCG84:   { label: "Jurien (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 114.9833333333, k: 1.00001000, x_0: 50000.0, y_0: 3550000.0, ellps: "aust_SA", units: "m" },

  KALB2020:{ label: "Kalbarri (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 114.3152777778, k: 1.00001400, x_0: 55000.0, y_0: 3700000.0, ellps: "GRS80", units: "m" },
  KALB94:  { label: "Kalbarri (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 114.3152777778, k: 1.00001400, x_0: 55000.0, y_0: 3600000.0, ellps: "GRS80", units: "m" },

  KAR2020: { label: "Karratha (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 116.9333333333, k: 0.99999890, x_0: 50000.0, y_0: 2550000.0, ellps: "GRS80", units: "m" },
  KAR94:   { label: "Karratha (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 116.9333333333, k: 0.99999890, x_0: 50000.0, y_0: 2450000.0, ellps: "GRS80", units: "m" },
  KAR84:   { label: "Karratha (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 116.9333333333, k: 1.00000400, x_0: 50000.0, y_0: 2450000.0, ellps: "aust_SA", units: "m" },

  KUN2020: { label: "Kununurra (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 128.7500000000, k: 1.00001650, x_0: 50000.0, y_0: 2100000.0, ellps: "GRS80", units: "m" },
  KUN94:   { label: "Kununurra (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 128.7500000000, k: 1.00001650, x_0: 50000.0, y_0: 2000000.0, ellps: "GRS80", units: "m" },
  KG84:    { label: "Kununurra (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 128.7500000000, k: 1.00001400, x_0: 50000.0, y_0: 2000000.0, ellps: "aust_SA", units: "m" },

  LCG2020: { label: "Lancelin (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 115.3666666667, k: 1.00000157, x_0: 50000.0, y_0: 3750000.0, ellps: "GRS80", units: "m" },
  LCG94:   { label: "Lancelin (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 115.3666666667, k: 1.00000157, x_0: 50000.0, y_0: 3650000.0, ellps: "GRS80", units: "m" },
  LCG84:   { label: "Lancelin (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 115.3666666667, k: 1.00000800, x_0: 50000.0, y_0: 3650000.0, ellps: "aust_SA", units: "m" },

  MRCG2020:{ label: "Margaret River (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 115.1666666667, k: 1.00000550, x_0: 50000.0, y_0: 4050000.0, ellps: "GRS80", units: "m" },
  MRCG94:  { label: "Margaret River (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 115.1666666667, k: 1.00000550, x_0: 50000.0, y_0: 3950000.0, ellps: "GRS80", units: "m" },
  MRCG84:  { label: "Margaret River (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 115.1000000000, k: 1.00001400, x_0: 50000.0, y_0: 4050000.0, ellps: "aust_SA", units: "m" },

  PCG2020: { label: "Perth (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 115.8166666667, k: 0.99999906, x_0: 50000, y_0: 3900000, ellps: "GRS80", units: "m" },
  PCG94:   { label: "Perth (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 115.8166666667, k: 0.99999906, x_0: 50000, y_0: 3800000, ellps: "GRS80", units: "m" },
  PCG84:   { label: "Perth (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 115.8333333333, k: 1.000006,   x_0: 40000, y_0: 3800000, ellps: "aust_SA", units: "m" },

  PHG2020: { label: "Port Hedland (GDA2020)", group: "GDA2020", proj: "tmerc", lat_0: 0, lon_0: 118.6000000000, k: 1.00000135, x_0: 50000.0, y_0: 2500000.0, ellps: "GRS80", units: "m" },
  PHG94:   { label: "Port Hedland (GDA94)",   group: "GDA94",   proj: "tmerc", lat_0: 0, lon_0: 118.6000000000, k: 1.00000135, x_0: 50000.0, y_0: 2400000.0, ellps: "GRS80", units: "m" },
  PHG84:   { label: "Port Hedland (AGD84)",   group: "AGD84",   proj: "tmerc", lat_0: 0, lon_0: 118.5833333333, k: 1.00000400, x_0: 50000.0, y_0: 2400000.0, ellps: "aust_SA", units: "m" },
};

export const DEFAULT_PROJECTION_CODE = "PCG2020";

const PROJECTION_CATALOGUE = {
  ...STANDARD_PROJECTIONS,
  ...LOCAL_GRID_PROJECTIONS,
};

function buildProj4String(def) {
  if (def.proj4) return def.proj4;

  const ignored = new Set(["label", "group"]);
  const parts = [];

  for (const [key, value] of Object.entries(def)) {
    if (ignored.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    parts.push(`+${key}=${value}`);
  }

  if (!parts.some((p) => p === "+no_defs")) {
    parts.push("+no_defs");
  }

  return parts.join(" ");
}

let defsRegistered = false;

export function registerProjectionDefs() {
  if (defsRegistered) return;

  for (const [code, def] of Object.entries(PROJECTION_CATALOGUE)) {
    proj4.defs(code, buildProj4String(def));
  }

  defsRegistered = true;
}

export function getProjectionLabel(code) {
  return PROJECTION_CATALOGUE[code]?.label || code;
}

export const PROJECTION_GROUPS = [
  "GDA2020",
  "GDA94",
  "AGD84",
  "Other",
].map((group) => ({
  label: group,
  options: Object.entries(PROJECTION_CATALOGUE)
    .filter(([, def]) => def.group === group)
    .map(([code, def]) => ({
      code,
      label: def.label,
    }))
    .sort((a, b) => {
      if (a.code === DEFAULT_PROJECTION_CODE) return -1;
      if (b.code === DEFAULT_PROJECTION_CODE) return 1;
      return a.label.localeCompare(b.label);
    }),
}));

export const PROJECTION_OPTIONS = PROJECTION_GROUPS.flatMap((group) =>
  group.options.map((option) => ({
    ...option,
    group: group.label,
  }))
);

const MGA2020_ZONE_TO_CODE = {
  49: "EPSG:7849",
  50: "EPSG:7850",
  51: "EPSG:7851",
  52: "EPSG:7852",
};

export function projectCoords(x, y, fromCode, toCode) {
  registerProjectionDefs();
  return proj4(fromCode, toCode, [Number(x), Number(y)]);
}

export function projectLonLatTo(lng, lat, toCode) {
  registerProjectionDefs();
  return proj4("EPSG:4326", toCode, [Number(lng), Number(lat)]);
}

export function projectToLonLat(x, y, fromCode) {
  registerProjectionDefs();
  const [lng, lat] = proj4(fromCode, "EPSG:4326", [Number(x), Number(y)]);
  return { lat, lng };
}

export function mgaToWgs84(zone, easting, northing) {
  registerProjectionDefs();

  const z = Number(zone);
  const e = Number(easting);
  const n = Number(northing);

  if (!Number.isFinite(z) || !Number.isFinite(e) || !Number.isFinite(n)) {
    return null;
  }

  const src = MGA2020_ZONE_TO_CODE[z];
  if (!src) return null;

  const [lng, lat] = proj4(src, "EPSG:4326", [e, n]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

export function wgs84ToMga2020(lat, lng) {
  registerProjectionDefs();

  const la = Number(lat);
  const lo = Number(lng);

  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;

  const rawZone = Math.floor((lo + 180) / 6) + 1;
  const zone = Math.min(52, Math.max(49, rawZone));
  const dst = MGA2020_ZONE_TO_CODE[zone];

  if (!dst) return null;

  const [easting, northing] = proj4("EPSG:4326", dst, [lo, la]);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;

  return { zone, easting, northing, code: dst };
}