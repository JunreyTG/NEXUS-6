FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package configurations
COPY apps/api/package*.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.log.config.ts ./apps/api/

WORKDIR /app/apps/api
RUN npm ci

# Copy full application source code
COPY apps/api/ ./

# Generate Prisma clients and build TypeScript bundle
RUN npx prisma generate && npx prisma generate --config prisma.log.config.ts
RUN npm run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app/apps/api

# Install production utilities
RUN apk add --no-cache curl

# Copy runtime node_modules and built assets
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/prisma.log.config.ts ./prisma.log.config.ts
COPY --from=builder /app/apps/api/package.json ./package.json

ENV NODE_ENV=production
ENV API_PORT=4000

EXPOSE 4000

CMD ["node", "dist/src/server.js"]
