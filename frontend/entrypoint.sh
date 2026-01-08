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

# We only want to substitute ${BACKEND_URL}
envsubst '${VITE_API_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Execute the CMD (nginx)
exec "$@"

