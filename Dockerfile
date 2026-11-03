# Serverul urNotes. Se construiește din rădăcina acestui repository:
#   docker build -t urnotes-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY shared ./shared
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
