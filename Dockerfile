# Serverul urNotes. Se construiește din rădăcina proiectului (are nevoie și de shared/):
#   docker build -f backend/Dockerfile -t urnotes-api .
FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY backend/migrations ./migrations
COPY shared /app/shared
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
