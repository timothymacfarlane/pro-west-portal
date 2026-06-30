const POWER_SERVICES = {
  power034: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer",
    allowedLayerIds: [8],
  },
  power031: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer",
    allowedLayerIds: [10],
  },
  power029: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer",
    allowedLayerIds: [2],
  },
  power035: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer",
    allowedLayerIds: [9],
  },
  power032: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer",
    allowedLayerIds: [11],
  },
  power030: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/WP_Public_Secure_Services/MapServer",
    allowedLayerIds: [1],
  },
  power051: {
    baseUrl:
      "https://services.slip.wa.gov.au/arcgis/rest/services/WP_Public_Secure_Services/NCMT_Public_Secure_Services/MapServer",
    allowedLayerIds: [2],
  },
};

const ALLOWED_OPERATIONS = new Set(["metadata", "query"]);
const ALLOWED_QUERY_PARAMS = new Set([
  "f",
  "where",
  "geometry",
  "geometryType",
  "inSR",
  "outSR",
  "spatialRel",
  "outFields",
  "returnGeometry",
  "returnZ",
  "resultOffset",
  "resultRecordCount",
  "orderByFields",
  "objectIds",
  "geometryPrecision",
  "maxAllowableOffset",
  "t",
]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function buildUpstreamUrl(service, layerId, operation, sourceParams) {
  const path = operation === "query" ? `${layerId}/query` : `${layerId}`;
  const params = new URLSearchParams();

  for (const key of ALLOWED_QUERY_PARAMS) {
    const values = sourceParams.getAll(key);
    values.forEach((value) => {
      if (value !== "") params.append(key, value);
    });
  }

  if (!params.has("f")) params.set("f", operation === "query" ? "geojson" : "json");

  return `${service.baseUrl}/${path}?${params.toString()}`;
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const requestUrl = new URL(event.rawUrl || `https://local${event.path}?${event.rawQuery || ""}`);
  const serviceId = requestUrl.searchParams.get("service") || "";
  const operation = requestUrl.searchParams.get("operation") || "";
  const layerId = Number(requestUrl.searchParams.get("layer"));

  const service = POWER_SERVICES[serviceId];
  if (!service) {
    return jsonResponse(400, { error: "Invalid Power service." });
  }

  if (!ALLOWED_OPERATIONS.has(operation)) {
    return jsonResponse(400, { error: "Invalid Power service operation." });
  }

  if (!Number.isInteger(layerId) || !service.allowedLayerIds.includes(layerId)) {
    return jsonResponse(400, { error: "Invalid Power service layer." });
  }

  const username = process.env.WP_ARCGIS_USERNAME;
  const password = process.env.WP_ARCGIS_PASSWORD;
  if (!username || !password) {
    return jsonResponse(500, { error: "Power service credentials are not configured." });
  }

  const upstreamUrl = buildUpstreamUrl(service, layerId, operation, requestUrl.searchParams);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Authorization: buildBasicAuthHeader(username, password),
        Accept: "application/json, application/geo+json;q=0.9, */*;q=0.1",
      },
      signal: controller.signal,
    });

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const body = await upstreamResponse.text();

    if (contentType.toLowerCase().includes("text/html")) {
      console.warn("[power-arcgis] Upstream returned HTML", {
        serviceId,
        layerId,
        operation,
        status: upstreamResponse.status,
      });
      return jsonResponse(upstreamResponse.status === 401 ? 401 : 502, {
        error:
          upstreamResponse.status === 401
            ? "Power service authentication failed."
            : "Power service returned an unexpected response.",
      });
    }

    return {
      statusCode: upstreamResponse.status,
      headers: {
        "Content-Type": contentType || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body,
    };
  } catch (error) {
    console.warn("[power-arcgis] Upstream request failed", {
      serviceId,
      layerId,
      operation,
      error: error?.name || "Error",
    });

    return jsonResponse(error?.name === "AbortError" ? 504 : 502, {
      error: "Power service request failed.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
