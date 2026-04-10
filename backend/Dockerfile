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
CMD ["sh", "-c", "for i in $(seq 1 30); do npx prisma db push && exec node dist/main.js; echo 'Waiting for database...'; sleep 2; done; echo 'Database unavailable'; exit 1"]
