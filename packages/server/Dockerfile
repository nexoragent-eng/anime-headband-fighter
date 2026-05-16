FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
RUN pnpm install --filter @ahf/shared --filter @ahf/server
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
RUN pnpm --filter @ahf/shared build
RUN pnpm --filter @ahf/server build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/server/package.json ./packages/server/
RUN pnpm install --filter @ahf/shared --filter @ahf/server --prod
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
RUN mkdir -p /data
EXPOSE 2567
CMD ["node", "packages/server/dist/index.js"]
