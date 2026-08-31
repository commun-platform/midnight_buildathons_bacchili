FROM node:22.15.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/sponsor-wallet ./apps/sponsor-wallet
COPY contracts/sensor-registry ./contracts/sensor-registry
COPY packages/shared ./packages/shared

RUN npm ci --workspace @midnight-demo/sponsor-wallet --include-workspace-root=false
RUN npm run build -w @midnight-demo/sponsor-wallet
RUN npm prune --omit=dev --workspace @midnight-demo/sponsor-wallet

ENV NODE_ENV=production
ENV SPONSOR_ZK_CONFIG_PATH=/app/contracts/sensor-registry/src/managed/sensor-registry
RUN test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerDevice.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerDevice.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerPolicyAssignment.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerPolicyAssignment.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/contract/index.js"
EXPOSE 8789

CMD ["node", "apps/sponsor-wallet/dist/supervisor.js"]
