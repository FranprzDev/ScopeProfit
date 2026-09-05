#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project="scopeprofit-smoke-$(date +%s)-$$"
compose=(docker compose -p "$project" -f docker-compose.smoke.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null; }
trap cleanup EXIT
"${compose[@]}" build test
"${compose[@]}" up -d --wait postgres
"${compose[@]}" run --rm test
"${compose[@]}" restart postgres
"${compose[@]}" up -d --wait postgres
"${compose[@]}" run --rm test node scripts/verify-persistence.mjs
