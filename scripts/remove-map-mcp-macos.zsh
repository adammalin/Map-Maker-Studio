#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
PORTABLE_NODE="${PROJECT_ROOT}/.runtime/node-current/bin/node"

if [[ -x "${PORTABLE_NODE}" ]]; then
  NODE_EXECUTABLE="${PORTABLE_NODE}"
elif command -v node >/dev/null 2>&1; then
  NODE_EXECUTABLE="$(command -v node)"
else
  print -u2 "Node.js is not available. Run scripts/setup-macos.zsh first."
  exit 1
fi

print ""
print "USA Map Studio - remove local AI connection"
print "================================================"
print ""

cd "${PROJECT_ROOT}"
exec "${NODE_EXECUTABLE}" "${PROJECT_ROOT}/scripts/configure-map-mcp.mjs" remove
