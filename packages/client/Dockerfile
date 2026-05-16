FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/client/package.json ./packages/client/
RUN pnpm install --filter @ahf/shared --filter @ahf/client
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client
ARG VITE_SERVER_URL=ws://localhost:2567
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN pnpm --filter @ahf/client build

FROM nginx:alpine
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
