#!/bin/sh
set -e

export API_PROXY_TARGET="${API_PROXY_TARGET:-http://host.docker.internal:8080}"
export AI_PROXY_TARGET="${AI_PROXY_TARGET:-http://host.docker.internal:8000}"

# Substitute environment variables into Nginx configuration
envsubst '${API_PROXY_TARGET} ${AI_PROXY_TARGET}' < /etc/nginx/default.conf.template > /etc/nginx/conf.d/default.conf

# Generate runtime config for the browser
USE_MOCK_VAL="${VITE_USE_MOCK:-false}"
case "$USE_MOCK_VAL" in
  true|1|yes) USE_MOCK_BOOL="true" ;;
  *) USE_MOCK_BOOL="false" ;;
esac

cat <<EOF > /usr/share/nginx/html/config.js
window.__SMART_CAFE_CONFIG__ = {
  apiBaseUrl: "${VITE_API_BASE_URL:-/api/v1}",
  googleClientId: "${VITE_GOOGLE_CLIENT_ID:-}",
  mockAuthBranchId: "${VITE_MOCK_AUTH_BRANCH_ID:-1}",
  useMock: ${USE_MOCK_BOOL}
};
EOF

exec "$@"
