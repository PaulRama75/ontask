#!/usr/bin/env bash
# Deploy / update the ontask app on the EC2 host.
# Run from the app directory, e.g.:  cd ~/ontask && ./deploy/aws/deploy.sh
#
# Prereqs (see DEPLOY.md): Node 20+, the repo cloned, and the production
# environment variables available to the build. This script sources them from
# the systemd EnvironmentFile so `prisma migrate deploy` and `next build` see
# DATABASE_URL and SSN_ENCRYPTION_KEY.

set -euo pipefail

ENV_FILE="${ONTASK_ENV_FILE:-/home/ontask/ontask.env}"
BRANCH="${ONTASK_BRANCH:-master}"

echo "==> Loading environment from $ENV_FILE"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "ERROR: env file $ENV_FILE not found. Create it first (see DEPLOY.md)." >&2
  exit 1
fi

echo "==> Fetching latest code ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing dependencies (clean, from lockfile)"
npm ci

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Building the app"
npm run build

echo "==> Restarting the service"
sudo systemctl restart ontask

echo "==> Done. Current status:"
sudo systemctl --no-pager status ontask | head -n 5
