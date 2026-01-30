#!/bin/sh

# Replace environment variables in nginx.conf.template and output to /etc/nginx/conf.d/default.conf
# We use a list of variables we want to substitute to avoid replacing $uri etc.
# But envsubst only replaces variables that are exported.
# So we need to ensure BACKEND_URL is exported (it is by Docker).

if [ -z "$VITE_API_URL" ]; then
    echo "WARNING: VITE_API_URL is not set. Defaulting to http://backend:8000"
    export VITE_API_URL="http://backend:8000"
fi

echo "Generating nginx.conf with BACKEND_URL=${VITE_API_URL}"

# We only want to substitute ${VITE_API_URL}
envsubst '${VITE_API_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Generate runtime env-config.js for the frontend.
# In the cloud the app is served by this nginx; API calls must go to same origin (/api/v1)
# so nginx can proxy them to the backend. So we set VITE_API_URL to relative path.
echo "Generating /usr/share/nginx/html/env-config.js with relative API base /api/v1"
cat > /usr/share/nginx/html/env-config.js << 'ENVCONFIG'
// Runtime env - injected at container start. Frontend uses relative /api/v1 so nginx can proxy.
window.__ENV__ = window.__ENV__ || {};
window.__ENV__.VITE_API_URL = '/api/v1';
ENVCONFIG

# Execute the CMD (nginx)
exec "$@"

