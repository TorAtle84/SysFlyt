FROM node:20-bullseye-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

FROM deps AS builder
COPY . .
# Disable Turbopack in Docker build to avoid port binding issues in build environment
ARG NEXT_DISABLE_TURBOPACK=1
ENV NEXT_DISABLE_TURBOPACK=${NEXT_DISABLE_TURBOPACK}
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_DISABLE_TURBOPACK=1

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p /app/uploads

EXPOSE 5000
CMD ["npm", "run", "start"]
