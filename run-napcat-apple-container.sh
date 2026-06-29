#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/.container-data/napcat/config"
PLUGINS_DIR="${SCRIPT_DIR}/.container-data/napcat/plugins"
QQ_DATA_DIR="${SCRIPT_DIR}/.container-data/napcat/qq"

mkdir -p "${CONFIG_DIR}" "${PLUGINS_DIR}" "${QQ_DATA_DIR}"

container run \
  --detach \
  --name napcat \
  --network default \
  --env "NAPCAT_UID=${NAPCAT_UID:-}" \
  --env "NAPCAT_GID=${NAPCAT_GID:-}" \
  --volume "${CONFIG_DIR}:/app/napcat/config" \
  --volume "${PLUGINS_DIR}:/app/napcat/plugins" \
  --volume "${QQ_DATA_DIR}:/app/.config/QQ" \
  --publish 127.0.0.1:3000:3000 \
  --publish 127.0.0.1:3001:3001 \
  --publish 127.0.0.1:6099:6099 \
  mlikiowa/napcat-docker:latest
