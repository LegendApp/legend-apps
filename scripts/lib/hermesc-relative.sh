#!/bin/bash
# Hermes records the input path as the bundle's source URL; compile from the input's
# directory so Release bytecode names main.jsbundle instead of a build-machine path.
set -euo pipefail
input="${*: -1}"
cd "$(dirname "$input")"
exec "${LEGEND_HERMES_CLI_PATH:?}" "${@:1:$#-1}" "$(basename "$input")"
