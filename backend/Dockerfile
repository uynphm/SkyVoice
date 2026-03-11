FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=5004
COPY --from=builder /app/dist ./dist
COPY package.json ./
RUN npm ci --omit=dev
EXPOSE 5004
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:5004/health || exit 1
CMD ["node", "dist/server.cjs"]