import hashlib
import logging
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

import jwt
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient
from pydantic import BaseModel, Field, field_validator
from pyproj import CRS, Transformer

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("prowest.transform_service")

MAX_POINTS = int(os.getenv("TRANSFORM_MAX_POINTS", "50000"))
SURVEY_GRADE_REQUIRED = os.getenv("TRANSFORM_SURVEY_GRADE_REQUIRED", "false").lower() in {
    "1",
    "true",
    "yes",
}
AUTH_REQUIRED = os.getenv("TRANSFORM_AUTH_REQUIRED", "false").lower() in {"1", "true", "yes"}
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_JWKS_URL = os.getenv("SUPABASE_JWKS_URL", "")
SUPABASE_JWT_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
RATE_LIMIT_REQUESTS = int(os.getenv("TRANSFORM_RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("TRANSFORM_RATE_LIMIT_WINDOW_SECONDS", "60"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "TRANSFORM_ALLOWED_ORIGINS",
        "https://pro-west-portal.netlify.app,http://localhost:5173,http://localhost:5174",
    ).split(",")
    if origin.strip()
]
GRID_FILENAME = "GDA94_GDA2020_conformal_and_distortion.gsb"
GRID_PATH = Path(os.getenv("GDA2020_GRID_PATH", f"/app/proj-data/{GRID_FILENAME}"))
GRID_SHA256 = os.getenv("GDA2020_GRID_SHA256", "").strip().lower()
EPSG_OPERATION = "8447"
GDA2020_FALLBACK_WARNING = "Approximate only — official NTv2 grid transformation not applied."

# TODO: Replace in-memory rate limiting with platform/WAF limits if traffic increases or multiple replicas are used.
# TODO: Add structured audit logging that records transform metadata without storing full export payloads.

TARGET_PROJECTIONS = {
    "EPSG:4326": {"label": "GDA94 geographic", "crs": "EPSG:4283", "datum": "GDA94"},
    "EPSG:28349": {"label": "MGA94 Zone 49", "crs": "EPSG:28349", "datum": "GDA94"},
    "EPSG:28350": {"label": "MGA94 Zone 50", "crs": "EPSG:28350", "datum": "GDA94"},
    "EPSG:28351": {"label": "MGA94 Zone 51", "crs": "EPSG:28351", "datum": "GDA94"},
    "EPSG:28352": {"label": "MGA94 Zone 52", "crs": "EPSG:28352", "datum": "GDA94"},
    "EPSG:7849": {"label": "MGA2020 Zone 49", "crs": "EPSG:7849", "datum": "GDA2020"},
    "EPSG:7850": {"label": "MGA2020 Zone 50", "crs": "EPSG:7850", "datum": "GDA2020"},
    "EPSG:7851": {"label": "MGA2020 Zone 51", "crs": "EPSG:7851", "datum": "GDA2020"},
    "EPSG:7852": {"label": "MGA2020 Zone 52", "crs": "EPSG:7852", "datum": "GDA2020"},
    "PCG2020": {
        "label": "Perth Coastal Grid 2020",
        "crs": "+proj=tmerc +lat_0=0 +lon_0=115.8166666667 +k=0.99999906 +x_0=50000 +y_0=3900000 +ellps=GRS80 +units=m +no_defs",
        "datum": "GDA2020",
    },
    "PCG94": {
        "label": "Perth Coastal Grid 1994",
        "crs": "+proj=tmerc +lat_0=0 +lon_0=115.8166666667 +k=0.99999906 +x_0=50000 +y_0=3800000 +ellps=GRS80 +units=m +no_defs",
        "datum": "GDA94",
    },
    "EPSG:20349": {"label": "AMG84 Zone 49", "crs": "EPSG:20349", "datum": "AGD84"},
    "EPSG:20350": {"label": "AMG84 Zone 50", "crs": "EPSG:20350", "datum": "AGD84"},
    "EPSG:20351": {"label": "AMG84 Zone 51", "crs": "EPSG:20351", "datum": "AGD84"},
    "EPSG:20352": {"label": "AMG84 Zone 52", "crs": "EPSG:20352", "datum": "AGD84"},
}


@dataclass(frozen=True)
class GridState:
    loaded: bool
    file: str
    sha256: str | None
    checksum_verified: bool
    error: str | None = None


def calculate_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_grid() -> GridState:
    if not GRID_PATH.exists():
        error = f"Official NTv2 grid file not found at {GRID_PATH}"
        if SURVEY_GRADE_REQUIRED:
            raise RuntimeError(error)
        return GridState(loaded=False, file=str(GRID_PATH), sha256=None, checksum_verified=False, error=error)

    actual_sha256 = calculate_sha256(GRID_PATH)
    if GRID_SHA256 and actual_sha256 != GRID_SHA256:
        error = (
            f"Official NTv2 grid SHA256 mismatch for {GRID_PATH}: "
            f"expected {GRID_SHA256}, got {actual_sha256}"
        )
        if SURVEY_GRADE_REQUIRED:
            raise RuntimeError(error)
        return GridState(
            loaded=False,
            file=str(GRID_PATH),
            sha256=actual_sha256,
            checksum_verified=False,
            error=error,
        )

    checksum_verified = bool(GRID_SHA256 and actual_sha256 == GRID_SHA256)
    if SURVEY_GRADE_REQUIRED and not checksum_verified:
        raise RuntimeError("TRANSFORM_SURVEY_GRADE_REQUIRED=true requires GDA2020_GRID_SHA256 to be configured and verified")

    return GridState(loaded=True, file=str(GRID_PATH), sha256=actual_sha256, checksum_verified=checksum_verified)


GRID_STATE = validate_grid()
_jwks_client = PyJWKClient(SUPABASE_JWKS_URL) if SUPABASE_JWKS_URL else None
_rate_limit_buckets: dict[str, tuple[int, float]] = {}


class TransformPoint(BaseModel):
    lng: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)


class TransformRequest(BaseModel):
    sourceDatumFamily: Literal["GDA94"] = "GDA94"
    targetProjection: str
    points: list[TransformPoint] = Field(..., min_length=1)

    @field_validator("targetProjection")
    @classmethod
    def validate_target_projection(cls, value: str) -> str:
        if value not in TARGET_PROJECTIONS:
            allowed = ", ".join(sorted(TARGET_PROJECTIONS))
            raise ValueError(f"Unsupported targetProjection '{value}'. Allowed values: {allowed}")
        return value

    @field_validator("points")
    @classmethod
    def validate_point_count(cls, value: list[TransformPoint]) -> list[TransformPoint]:
        if len(value) > MAX_POINTS:
            raise ValueError(f"Too many points. Maximum is {MAX_POINTS} per request.")
        return value


class TransformResponse(BaseModel):
    sourceDatumFamily: str
    sourceCrs: str
    targetProjection: str
    targetProjectionLabel: str
    targetDatumFamily: str
    transform: str
    accuracyStatus: str
    warning: str | None = None
    pointCount: int
    points: list[tuple[float, float]]


def decode_supabase_jwt(token: str) -> dict:
    options = {"require": ["exp"]}
    audience = SUPABASE_JWT_AUDIENCE or None

    try:
        if _jwks_client:
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(token, signing_key.key, algorithms=["RS256", "ES256"], audience=audience, options=options)
        if SUPABASE_JWT_SECRET:
            return jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience=audience, options=options)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired authorization token") from exc

    raise HTTPException(status_code=503, detail="Authentication is required but no JWT validation method is configured")


def authenticate_request(request: Request) -> str:
    if not AUTH_REQUIRED:
        return "anonymous"

    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer authorization token")

    claims = decode_supabase_jwt(auth_header.split(" ", 1)[1].strip())
    subject = claims.get("sub")
    if not subject:
        raise HTTPException(status_code=401, detail="Authorization token is missing subject")
    return str(subject)


def enforce_rate_limit(request: Request, principal: str) -> None:
    now = time.monotonic()
    client_host = request.client.host if request.client else "unknown"
    key = principal if principal != "anonymous" else client_host
    count, reset_at = _rate_limit_buckets.get(key, (0, now + RATE_LIMIT_WINDOW_SECONDS))

    if now >= reset_at:
        count = 0
        reset_at = now + RATE_LIMIT_WINDOW_SECONDS

    if count >= RATE_LIMIT_REQUESTS:
        retry_after = max(1, int(reset_at - now))
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    _rate_limit_buckets[key] = (count + 1, reset_at)


app = FastAPI(title="Pro West Coordinate Transform Service", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.on_event("startup")
def log_startup_state() -> None:
    logger.info(
        "Transform service startup: gridLoaded=%s checksumVerified=%s epsgOperation=%s gridFile=%s surveyGradeRequired=%s authRequired=%s allowedOrigins=%s",
        GRID_STATE.loaded,
        GRID_STATE.checksum_verified,
        EPSG_OPERATION,
        GRID_STATE.file,
        SURVEY_GRADE_REQUIRED,
        AUTH_REQUIRED,
        ALLOWED_ORIGINS,
    )
    if GRID_STATE.error:
        logger.warning("Transform service grid warning: %s", GRID_STATE.error)


@app.middleware("http")
async def auth_and_rate_limit_middleware(request: Request, call_next):
    if request.url.path != "/health":
        principal = authenticate_request(request)
        enforce_rate_limit(request, principal)
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str | bool | int | None]:
    return {
        "status": "ok",
        "gridLoaded": GRID_STATE.loaded,
        "gridFile": GRID_STATE.file,
        "gridSha256": GRID_STATE.sha256,
        "checksumVerified": GRID_STATE.checksum_verified,
        "gridError": GRID_STATE.error,
        "epsgOperation": EPSG_OPERATION,
        "maxPoints": MAX_POINTS,
        "authRequired": AUTH_REQUIRED,
        "allowedOrigins": ",".join(ALLOWED_ORIGINS),
    }


def target_uses_gda2020(target_projection: str) -> bool:
    return TARGET_PROJECTIONS[target_projection]["datum"] == "GDA2020"


def get_mga2020_zone(target_projection: str) -> int | None:
    return {
        "EPSG:7849": 49,
        "EPSG:7850": 50,
        "EPSG:7851": 51,
        "EPSG:7852": 52,
    }.get(target_projection)


def build_gda2020_grid_pipeline(target_projection: str) -> str:
    grid_step = (
        f"+step +proj=hgridshift +grids={GRID_STATE.file}"
    )

    if target_projection == "PCG2020":
        projection_step = (
            "+step +proj=tmerc +lat_0=0 +lon_0=115.8166666667 "
            "+k=0.99999906 +x_0=50000 +y_0=3900000 +ellps=GRS80"
        )
    else:
        zone = get_mga2020_zone(target_projection)
        if zone is None:
            raise ValueError(f"No explicit grid pipeline is configured for {target_projection}")
        projection_step = f"+step +proj=utm +zone={zone} +south +ellps=GRS80"

    return " ".join(
        [
            "+proj=pipeline",
            "+step +proj=unitconvert +xy_in=deg +xy_out=rad",
            grid_step,
            projection_step,
        ]
    )


def get_source_crs(target_projection: str) -> CRS:
    if target_uses_gda2020(target_projection) and GRID_STATE.loaded:
        return CRS.from_proj4(
            f"+proj=longlat +ellps=GRS80 +nadgrids={GRID_STATE.file} +no_defs +type=crs"
        )
    return CRS.from_epsg(4283)


@lru_cache(maxsize=32)
def get_transformer(target_projection: str, grid_loaded: bool) -> Transformer:
    target = TARGET_PROJECTIONS[target_projection]
    if target["datum"] == "GDA2020" and grid_loaded:
        return Transformer.from_pipeline(build_gda2020_grid_pipeline(target_projection))

    source_crs = get_source_crs(target_projection)
    target_crs = CRS.from_user_input(target["crs"])
    return Transformer.from_crs(source_crs, target_crs, always_xy=True)


def get_accuracy_status(target_projection: str) -> tuple[str, str | None, str]:
    target = TARGET_PROJECTIONS[target_projection]
    if target["datum"] == "GDA2020":
        if GRID_STATE.loaded:
            return (
                "official-grid",
                None,
                f"GDA94 geographic -> EPSG:{EPSG_OPERATION} NTv2 conformal + distortion grid -> {target_projection}",
            )
        return (
            "approximate-fallback",
            GDA2020_FALLBACK_WARNING,
            "GDA94 geographic -> pyproj default transform placeholder -> target projection",
        )
    return ("local-transform", None, "GDA94 geographic -> target projection")


@app.post("/transform/export-coordinates", response_model=TransformResponse)
def transform_export_coordinates(payload: TransformRequest) -> TransformResponse:
    target = TARGET_PROJECTIONS[payload.targetProjection]

    if target["datum"] == "GDA2020" and SURVEY_GRADE_REQUIRED and not GRID_STATE.loaded:
        raise HTTPException(status_code=503, detail=GRID_STATE.error or GDA2020_FALLBACK_WARNING)

    try:
        transformer = get_transformer(payload.targetProjection, GRID_STATE.loaded)
        output = [transformer.transform(point.lng, point.lat) for point in payload.points]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Coordinate transform failed: {exc}") from exc

    accuracy_status, warning, transform_route = get_accuracy_status(payload.targetProjection)

    return TransformResponse(
        sourceDatumFamily=payload.sourceDatumFamily,
        sourceCrs="EPSG:4283",
        targetProjection=payload.targetProjection,
        targetProjectionLabel=target["label"],
        targetDatumFamily=target["datum"],
        transform=transform_route,
        accuracyStatus=accuracy_status,
        warning=warning,
        pointCount=len(output),
        points=[(float(x), float(y)) for x, y in output],
    )
