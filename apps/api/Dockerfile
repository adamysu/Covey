FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace @covey/api

FROM deps AS build
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY packages/db packages/db
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
