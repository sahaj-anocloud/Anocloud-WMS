# Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy root config and package.json files for workspace setup
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/wms-api ./apps/wms-api

# Install dependencies
RUN npm install

# Build the API
WORKDIR /app/apps/wms-api
RUN npm run build

# Production Stage
FROM node:20-slim

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/wms-api/dist ./apps/wms-api/dist
COPY --from=builder /app/apps/wms-api/package.json ./apps/wms-api/package.json

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run the server
CMD ["node", "apps/wms-api/dist/index.js"]
