#!/usr/bin/env bash
# Builds and publishes the site on Cloudflare Pages (project "tidbit-legios" → tidbit.legios.com.ar).
# Uploads a copy of dist/ from a temporary directory: if wrangler runs inside the project it tries to
# "autoconfigure" it and adds files the static site does not want.
#   SITE_URL=https://tidbit-legios.pages.dev scripts/deploy.sh   # build against another address
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN_FILE="${CLOUDFLARE_TOKEN_FILE:-$HOME/.config/cloudflare/token}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$(tr -d '[:space:]' < "$TOKEN_FILE")}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-f8ac2ab50e3b244d5a69b0205fc3020d}"
PROJECT="${PAGES_PROJECT:-tidbit-legios}"

SITE_URL="${SITE_URL:-https://tidbit.legios.com.ar}" node scripts/build-site.mjs
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R dist "$tmp/site"
(cd "$tmp" && npx --yes wrangler@4 pages deploy site --project-name "$PROJECT" --branch main \
  --commit-hash "$(git -C "$OLDPWD" rev-parse HEAD)" --commit-message "$(git -C "$OLDPWD" log -1 --format=%s)" --commit-dirty=true)
