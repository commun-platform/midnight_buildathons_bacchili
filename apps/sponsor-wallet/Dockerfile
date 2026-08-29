FROM node:22.15.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/sponsor-wallet ./apps/sponsor-wallet
COPY contracts/sensor-registry/src/managed ./contracts/sensor-registry/src/managed

RUN npm ci --workspace @midnight-demo/sponsor-wallet --include-workspace-root=false
RUN npm run build -w @midnight-demo/sponsor-wallet
RUN npm prune --omit=dev --workspace @midnight-demo/sponsor-wallet

ENV NODE_ENV=production
EXPOSE 8789

CMD ["node", "apps/sponsor-wallet/dist/supervisor.js"]
