FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server/ ./server/
COPY tsconfig.json ./
RUN npx tsc -p tsconfig.json
COPY server/db/schema.sql ./dist/server/db/schema.sql
COPY scripts/ ./dist/scripts/

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/dist ./dist/
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /data
ENV DB_PATH=/data/cucm.db
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
