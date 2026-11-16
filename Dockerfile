FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

FROM dependencies AS source
COPY . .
RUN npx prisma generate

FROM source AS build-gym
RUN npm run build:gym

FROM source AS build-tienda
RUN npm run build:tienda

FROM base AS runtime
COPY --from=source /app/node_modules ./node_modules
COPY --from=source /app/package*.json ./
COPY --from=source /app/prisma ./prisma/

FROM runtime AS tienda
COPY --from=build-tienda /app/build/tienda-api ./build/tienda-api
EXPOSE 8081
CMD ["node", "build/tienda-api/apps/tienda-api/src/main"]

FROM runtime AS gym
COPY --from=build-gym /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/apps/gym-api/src/main"]
