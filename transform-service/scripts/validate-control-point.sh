#!/usr/bin/env bash
set -euo pipefail

: "${SERVICE_URL:?Set SERVICE_URL to the transform-service base URL}"
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN to a logged-in Supabase access token}"

echo "Checking health..."
curl -s "$SERVICE_URL/health"
echo
echo

echo "Checking Perth PCG2020 control point..."
curl -s "$SERVICE_URL/transform/export-coordinates" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceDatumFamily": "GDA94",
    "targetProjection": "PCG2020",
    "points": [
      { "lng": 116.027281614636, "lat": -31.86957386944 }
    ]
  }'
echo
echo

echo "Expected: E 69930.801, N 372595.425, residual < 0.01 m"
