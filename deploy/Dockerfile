FROM node:22-bookworm-slim AS node-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

FROM node-base AS build-dependencies
RUN npm ci --include=dev

FROM build-dependencies AS backend-build
COPY backend/ backend/
# Prisma validates the URL during generation and never connects during this build.
RUN DIRECT_URL=postgresql://127.0.0.1/taskflow npm run build:backend

FROM node-base AS api
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace=backend
COPY --from=backend-build /app/node_modules/.prisma/ node_modules/.prisma/
COPY --from=backend-build /app/backend/dist/ backend/dist/
USER node
EXPOSE 3001
CMD ["node", "backend/dist/index.js"]

FROM build-dependencies AS frontend-build
COPY frontend/ frontend/
RUN npm run build:frontend

FROM nginx:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist/ /usr/share/nginx/html/
