# Production build. Build context is the repo ROOT (shared engine is built and
# shipped alongside the server via its `file:../shared` dependency).
FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ /shared/
RUN cd /shared && npm install --no-audit --no-fund && npm run build
COPY server/package*.json ./
RUN npm install --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

# Production runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /shared ./shared
COPY --from=builder /app/dist ./dist
COPY server/package*.json ./
COPY server/knexfile.ts ./

EXPOSE 3001
CMD ["node", "dist/index.js"]
