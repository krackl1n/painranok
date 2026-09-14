# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
WORKDIR /app
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 65532 rvspace && \
    adduser --system --uid 65532 --ingroup rvspace nextjs
COPY --from=build --chown=nextjs:rvspace /app/public ./public
COPY --from=build --chown=nextjs:rvspace /app/.next/standalone ./
COPY --from=build --chown=nextjs:rvspace /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]