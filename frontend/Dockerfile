# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
# הערה קריטית: 'npm ci' דורשת שקובץ package-lock.json יהיה קיים בהקשר הבנייה.
# ודא שגם package.json וגם package-lock.json נמצאים באותה ספרייה כמו ה-Dockerfile.
COPY /package*.json ./

# Install dependencies
# Install dependencies
RUN npm ci --legacy-peer-deps
# Copy source
COPY ../project-menagment/frontend .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Build the app
RUN npm run build

# --- DIAGNOSTIC STEP (For debugging if the fix doesn't work) ---
# This command lists the files in /app to confirm the name of the built folder (e.g., build, dist, out).
RUN ls -al /app

# Production stage
FROM nginx:alpine

# Install envsubst (contained in gettext package) if not present
# Alpine's nginx image usually has it, but better safe.
# NOTE: nginx:alpine usually does NOT have bash, use sh.
# Recent versions (1.19+) have envsubst built-in or via package.
RUN apk add --no-cache gettext

# Copy built files
# FIX: Changed the path from '/app/build' to the common default, '/app/dist'.
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template
# We store it in templates dir for organization or directly where we need it
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /docker-entrypoint.sh

# Make entrypoint executable
RUN chmod +x /docker-entrypoint.sh

# Render expects the app to listen on $PORT
# But Nginx defaults to 80, so we'll handle this in nginx.conf
EXPOSE 10000

# Use our custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]