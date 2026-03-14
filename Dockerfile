FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /data
ENV DB_PATH=/data/cucm.db
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
