# Pro West Coordinate Transform Service

Standalone FastAPI service foundation for survey-grade coordinate export transforms.

This service is intentionally separate from the Vite frontend. Do **not** add the official 79.2 MiB NTv2 grid to frontend assets.

## Current Stage

Stage 2C:

- Provides `POST /transform/export-coordinates`.
- Validates request shape, target projection, and maximum point count.
- Loads the official `GDA94_GDA2020_conformal_and_distortion.gsb` grid when it is mounted at `GDA2020_GRID_PATH`.
- Uses the official EPSG:8447 NTv2 conformal + distortion grid route for GDA94 -> GDA2020 targets when the grid is available and checksum validation passes.
- Falls back to approximate mode only when survey-grade mode is not required and the grid is absent.
- Does not include or download the `.gsb` grid file.
- Adds optional Supabase JWT validation, strict CORS configuration, simple in-memory rate limiting, and startup logging.


## Recommended Deployment Target

Recommended first deployment target: **Google Cloud Run**.

Why Cloud Run is the simplest safe fit for this service:

- Runs the existing Docker container directly.
- Supports enough memory for `pyproj`, PROJ data, and the 79.2 MiB grid.
- Can mount or bake the grid into the container image, with startup SHA256 verification.
- Provides managed HTTPS, autoscaling, request timeouts, IAM options, logging, and environment variables.
- Keeps the transform service separate from the Netlify frontend and Supabase Edge runtime.

Render is also viable and simpler operationally if Pro West prefers a dashboard-driven service. Use Cloud Run if GCP is acceptable; use Render if low-admin Git-backed deployment is more important than cloud-native controls.

## Security Configuration

Production should set:

```bash
TRANSFORM_AUTH_REQUIRED=true
SUPABASE_JWT_SECRET=<supabase-jwt-secret>
# or, if using asymmetric signing keys:
SUPABASE_JWKS_URL=<supabase-jwks-url>
SUPABASE_JWT_AUDIENCE=authenticated
TRANSFORM_ALLOWED_ORIGINS=https://pro-west-portal.netlify.app
TRANSFORM_RATE_LIMIT_REQUESTS=60
TRANSFORM_RATE_LIMIT_WINDOW_SECONDS=60
```

Authentication is disabled by default for local development. Do not expose production without `TRANSFORM_AUTH_REQUIRED=true`.

## Deployment Instructions: Cloud Run

1. Confirm the official grid file and checksum locally:

   ```bash
   sha256sum GDA94_GDA2020_conformal_and_distortion.gsb
   ```

2. Build and push the container image to Artifact Registry.

3. Provide the grid either by baking it into a private image layer or copying it into the container/runtime filesystem before startup. If using a mounted or downloaded artifact, set:

   ```bash
   GDA2020_GRID_PATH=/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb
   GDA2020_GRID_SHA256=4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a
   TRANSFORM_SURVEY_GRADE_REQUIRED=true
   ```

4. Deploy with at least 1 CPU and 512 MiB memory. Increase memory if startup/grid parsing shows pressure.

5. Set runtime environment variables for Supabase auth, CORS, grid checksum, and rate limits.

6. Set `/health` as the health check path.

7. Confirm startup logs show:

   ```text
   gridLoaded=True checksumVerified=True epsgOperation=8447
   ```

8. Run the PCG2020 control-point request and confirm residual is under 0.01 m.

## Deployment Checklist

Before Stage 3 frontend integration:

- [ ] Docker image builds in the deployment platform.
- [ ] Official grid is present at `GDA2020_GRID_PATH`.
- [ ] `GDA2020_GRID_SHA256` matches the official grid.
- [ ] `TRANSFORM_SURVEY_GRADE_REQUIRED=true` is enabled.
- [ ] `/health` returns `gridLoaded: true`, `checksumVerified: true`, and `epsgOperation: "8447"`.
- [ ] Supabase JWT validation is enabled with `TRANSFORM_AUTH_REQUIRED=true`.
- [ ] CORS is restricted to Pro West Portal domains.
- [ ] Rate limits are configured for expected export usage.
- [ ] Known PCG2020 control point residual is less than 0.01 m.
- [ ] Additional WA control points across required zones are validated.
- [ ] Service URL and auth flow are confirmed for `Maps.jsx`.

## Grid File

Expected file:

```text
GDA94_GDA2020_conformal_and_distortion.gsb
```

Default runtime path:

```text
/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb
```

Known SHA256 from the official grid file used during validation:

```text
4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a
```

Production should set:

```bash
TRANSFORM_SURVEY_GRADE_REQUIRED=true
GDA2020_GRID_PATH=/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb
GDA2020_GRID_SHA256=4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a
```

If `TRANSFORM_SURVEY_GRADE_REQUIRED=true`, the service fails startup when the grid is missing or the checksum does not match.

## Health

```http
GET /health
```

Example with grid loaded:

```json
{
  "status": "ok",
  "gridLoaded": true,
  "gridFile": "/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb",
  "gridSha256": "4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a",
  "checksumVerified": true,
  "gridError": null,
  "epsgOperation": "8447",
  "maxPoints": 50000,
  "authRequired": true,
  "allowedOrigins": "https://pro-west-portal.netlify.app"
}
```

## Endpoint

```http
POST /transform/export-coordinates
```

Request:

```json
{
  "sourceDatumFamily": "GDA94",
  "targetProjection": "PCG2020",
  "points": [
    { "lng": 116.027281614636, "lat": -31.86957386944 }
  ]
}
```

Survey-grade response when the grid is loaded:

```json
{
  "sourceDatumFamily": "GDA94",
  "sourceCrs": "EPSG:4283",
  "targetProjection": "PCG2020",
  "targetProjectionLabel": "Perth Coastal Grid 2020",
  "targetDatumFamily": "GDA2020",
  "transform": "GDA94 geographic -> EPSG:8447 NTv2 conformal + distortion grid -> PCG2020",
  "accuracyStatus": "official-grid",
  "warning": null,
  "pointCount": 1,
  "points": [[69930.801, 372595.425]]
}
```

Fallback response when the grid is absent and survey-grade mode is not required:

```json
{
  "accuracyStatus": "approximate-fallback",
  "warning": "Approximate only — official NTv2 grid transformation not applied."
}
```

## Supported Target Projections

- `EPSG:4326`
- `EPSG:28349` to `EPSG:28352` MGA94 zones 49-52
- `EPSG:7849` to `EPSG:7852` MGA2020 zones 49-52
- `PCG2020`
- `PCG94`
- `EPSG:20349` to `EPSG:20352` AMG84 zones 49-52

## Local Development

```bash
cd transform-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run tests without the grid:

```bash
pytest
```

Run tests with the official grid:

```bash
GDA2020_GRID_PATH=/path/to/GDA94_GDA2020_conformal_and_distortion.gsb \
GDA2020_GRID_SHA256=4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a \
pytest
```

The PCG2020 control-point test is skipped unless the official grid is present.

## Docker

```bash
cd transform-service
docker build -t prowest-transform-service .
docker run --rm -p 8000:8000 \
  -e TRANSFORM_SURVEY_GRADE_REQUIRED=true \
  -e GDA2020_GRID_SHA256=4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a \
  -v /secure/proj-data:/app/proj-data:ro \
  prowest-transform-service
```

## Production TODOs

Before connecting `Maps.jsx` exports to this service:

1. Mount the official grid at `GDA2020_GRID_PATH`.
2. Keep SHA256 verification enabled.
3. Validate against multiple known WA control points before labelling results survey-grade.
4. Validate Supabase JWTs on every request.
5. Restrict CORS to Pro West Portal production and preview domains.
6. Add request logging that records transform metadata without storing full sensitive export payloads.
7. Add deployment-specific rate limits and max request body limits.

## Deployment Notes

Recommended runtime: Dockerized Python service on Render, Fly.io, Railway, Google Cloud Run, or similar.

Avoid Supabase Edge Functions and Netlify Functions for the final grid-backed implementation because the service needs native PROJ/pyproj support and access to the large NTv2 grid file.
