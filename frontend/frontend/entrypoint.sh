#!/bin/sh
set -eu

cat > /app/config.js <<EOF
window.APP_CONFIG = {
  gatewayUrl: "${GATEWAY_WS_URL:-}"
};
EOF

exec serve -s . -l "${PORT:-3000}"
