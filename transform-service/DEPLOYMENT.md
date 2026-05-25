# Transform Service Deployment Guide

This guide prepares the standalone `transform-service` for deployment before any `Maps.jsx` integration.

The frontend must not bundle the NTv2 grid. The grid is mounted or copied into the backend container only.

## Recommended Target

Use **Google Cloud Run** for the first production deployment. It supports Docker containers, managed HTTPS, environment variables/secrets, startup logs, health checks, and enough memory for `pyproj` plus the 79.2 MiB grid.

## Required Grid

Official grid file:

```text
GDA94_GDA2020_conformal_and_distortion.gsb
```

Expected SHA256:

```text
4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a
```

Recommended container path:

```text
/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb
```

## How To Place The Grid

Preferred options, in order:

1. **Private image layer**
   - Copy the grid into the Docker image during a private deployment build.
   - Do not commit the grid to Git.
   - Use a private Artifact Registry repository.

2. **Runtime mounted volume/artifact**
   - Mount or copy the grid into `/app/proj-data` before app startup.
   - Keep `TRANSFORM_SURVEY_GRADE_REQUIRED=true` so startup fails if the grid is absent.

3. **Startup download from private storage**
   - Download the grid from a private bucket before launching `uvicorn`.
   - Verify SHA256 before serving traffic.

Do not use the Vite frontend, Netlify static assets, or public browser downloads for the grid.

## Required Environment Variables

```bash
TRANSFORM_SURVEY_GRADE_REQUIRED=true
GDA2020_GRID_PATH=/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb
GDA2020_GRID_SHA256=4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a
TRANSFORM_AUTH_REQUIRED=true
SUPABASE_JWT_SECRET=<supabase-jwt-secret>
# or, if using asymmetric signing keys:
SUPABASE_JWKS_URL=<supabase-jwks-url>
SUPABASE_JWT_AUDIENCE=authenticated
TRANSFORM_ALLOWED_ORIGINS=https://pro-west-portal.netlify.app
TRANSFORM_RATE_LIMIT_REQUESTS=60
TRANSFORM_RATE_LIMIT_WINDOW_SECONDS=60
```

## Cloud Run Build And Deploy

Set shell variables:

```bash
PROJECT_ID=<gcp-project-id>
REGION=australia-southeast1
SERVICE=prowest-transform-service
REPOSITORY=prowest
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE:latest
```

Create Artifact Registry repository once:

```bash
gcloud artifacts repositories create $REPOSITORY \
  --repository-format=docker \
  --location=$REGION
```

Build and push from the repo root:

```bash
gcloud builds submit transform-service --tag $IMAGE
```

Deploy:

```bash
gcloud run deploy $SERVICE \
  --image $IMAGE \
  --region $REGION \
  --platform managed \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars TRANSFORM_SURVEY_GRADE_REQUIRED=true,GDA2020_GRID_PATH=/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb,GDA2020_GRID_SHA256=4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a,TRANSFORM_AUTH_REQUIRED=true,SUPABASE_JWT_AUDIENCE=authenticated,TRANSFORM_ALLOWED_ORIGINS=https://pro-west-portal.netlify.app,TRANSFORM_RATE_LIMIT_REQUESTS=60,TRANSFORM_RATE_LIMIT_WINDOW_SECONDS=60
```

Set sensitive values such as `SUPABASE_JWT_SECRET` using Secret Manager rather than inline env vars where possible.

## Startup Validation

Confirm logs include:

```text
gridLoaded=True checksumVerified=True epsgOperation=8447
```

If `TRANSFORM_SURVEY_GRADE_REQUIRED=true`, startup should fail when the grid is missing or checksum verification fails.

## Validation Curl Examples

Set variables:

```bash
SERVICE_URL=https://<cloud-run-service-url>
SUPABASE_ACCESS_TOKEN=<logged-in-user-access-token>
```

Health:

```bash
curl -s "$SERVICE_URL/health" | jq
```

Expected health fields:

```json
{
  "status": "ok",
  "gridLoaded": true,
  "checksumVerified": true,
  "epsgOperation": "8447"
}
```

Perth PCG2020 control point:

```bash
curl -s "$SERVICE_URL/transform/export-coordinates" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceDatumFamily": "GDA94",
    "targetProjection": "PCG2020",
    "points": [
      { "lng": 116.027281614636, "lat": -31.86957386944 }
    ]
  }' | jq
```

Expected result:

```text
E 69930.801
N 372595.425
residual < 0.01 m
```

The response should include:

```json
{
  "accuracyStatus": "official-grid",
  "warning": null,
  "points": [[69930.801, 372595.425]]
}
```


## Private Docker Image Workflow For Render

Use this path when Render should run a private Docker image that already contains the official grid. Do not commit the grid to Git.

### 1. Temporary Local Grid Location

Place the official grid at:

```text
transform-service/private-grid/GDA94_GDA2020_conformal_and_distortion.gsb
```

Confirm checksum before building:

```bash
sha256sum transform-service/private-grid/GDA94_GDA2020_conformal_and_distortion.gsb
```

Expected:

```text
4faecf467eaf646bc97983865ac1a4380001781ac504a13aae8a7f9da102496a
```

### 2. Deployment-Only Dockerfile

Use:

```text
transform-service/Dockerfile.grid
```

It copies the grid into:

```text
/app/proj-data/GDA94_GDA2020_conformal_and_distortion.gsb
```

### 3. Build Locally

From repo root:

```bash
docker build \
  -f transform-service/Dockerfile.grid \
  --ignorefile transform-service/.dockerignore.grid \
  -t prowest-transform-service:grid \
  transform-service
```

### 4. Tag And Push To Private Registry

Example using Docker Hub private repo:

```bash
docker login
docker tag prowest-transform-service:grid <dockerhub-user>/prowest-transform-service:grid
docker push <dockerhub-user>/prowest-transform-service:grid
```

Example using GitHub Container Registry:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
docker tag prowest-transform-service:grid ghcr.io/<github-org-or-user>/prowest-transform-service:grid
docker push ghcr.io/<github-org-or-user>/prowest-transform-service:grid
```

### 5. Point Render To The Private Image

In Render dashboard:

1. Click **New +**.
2. Choose **Web Service**.
3. Choose **Deploy an existing image** / private registry image if available on your Render plan.
4. Enter the private image, for example:

   ```text
   ghcr.io/<github-org-or-user>/prowest-transform-service:grid
   ```

5. Add registry credentials if Render asks for them.
6. Set health check path to `/health`.
7. Add the production environment variables listed in this guide.

### 6. Keep Git And Normal Docker Builds Safe

The repository root `.gitignore` ignores `*.gsb`, so the staged grid file should not be committed.

The normal `transform-service/.dockerignore` also excludes `*.gsb` and `proj-data/*.gsb`, so standard Docker builds do not include the grid accidentally.

Only the explicit deployment build command using `Dockerfile.grid` and `.dockerignore.grid` includes:

```text
private-grid/GDA94_GDA2020_conformal_and_distortion.gsb
```

## Deployment Checklist

- [ ] `Maps.jsx` remains disconnected from the service.
- [ ] Docker image builds successfully.
- [ ] Official grid is present at `GDA2020_GRID_PATH`.
- [ ] `GDA2020_GRID_SHA256` matches the official grid.
- [ ] `TRANSFORM_SURVEY_GRADE_REQUIRED=true` is enabled.
- [ ] `TRANSFORM_AUTH_REQUIRED=true` is enabled.
- [ ] `SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL` is configured.
- [ ] `TRANSFORM_ALLOWED_ORIGINS` is restricted to Pro West Portal domains.
- [ ] `/health` reports `gridLoaded: true`, `checksumVerified: true`, `epsgOperation: "8447"`.
- [ ] Startup logs confirm grid and checksum status.
- [ ] PCG2020 control point residual is less than 0.01 m.
- [ ] Additional WA validation/control points are tested before Stage 3.
- [ ] Final service URL is recorded for frontend integration.
