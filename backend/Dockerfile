FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package.json
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
EXPOSE 8080 8081
CMD sh -c 'for i in $(seq 1 30); do out=$(npx prisma migrate deploy 2>&1); code=$?; if [ $code -eq 0 ]; then exec node dist/main.js; fi; echo "$out"; if echo "$out" | grep -q "Error: P3005"; then echo "Prisma P3005: database is not empty and migrations are not baselined."; echo "Run once: docker compose run --rm api sh -lc \"for m in \\$(ls -1 prisma/migrations | grep -v migration_lock.toml); do npx prisma migrate resolve --applied \\\"\\$m\\\"; done; npx prisma migrate deploy\""; exit 1; fi; echo "Waiting for database..."; sleep 2; done; echo "Database unavailable"; exit 1'
