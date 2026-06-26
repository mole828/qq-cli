#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/.container-data/napcat"

mkdir -p "${DATA_DIR}"

container run \
  --detach \
  --name napcat \
  --network default \
  --env "NAPCAT_UID=${NAPCAT_UID:-}" \
  --env "NAPCAT_GID=${NAPCAT_GID:-}" \
  --volume "${DATA_DIR}:/app/napcat" \
  --publish 127.0.0.1:3000:3000 \
  --publish 127.0.0.1:3001:3001 \
  --publish 127.0.0.1:6099:6099 \
  mlikiowa/napcat-docker:latest
