# Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy root config and package.json files for workspace setup
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/vendor-portal ./apps/vendor-portal

# Install dependencies
RUN npm install

# Build the Next.js app
WORKDIR /app/apps/vendor-portal
RUN npm run build

# Production Stage
FROM node:20-slim

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/vendor-portal/.next ./apps/vendor-portal/.next
COPY --from=builder /app/apps/vendor-portal/public ./apps/vendor-portal/public
COPY --from=builder /app/apps/vendor-portal/package.json ./apps/vendor-portal/package.json
COPY --from=builder /app/apps/vendor-portal/next.config.mjs ./apps/vendor-portal/next.config.mjs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run the server
CMD ["npm", "run", "start", "--workspace=apps/vendor-portal"]
