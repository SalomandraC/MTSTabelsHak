FROM node:22.23.3-alpine

WORKDIR /app

# Avoid the npm 10 Arborist crash while resolving optional peer dependencies.
RUN npm install --global npm@11.8.0 --no-audit --no-fund

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
