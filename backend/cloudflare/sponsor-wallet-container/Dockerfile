FROM node:22.15.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/cloudflare/sponsor-wallet-container ./backend/cloudflare/sponsor-wallet-container
COPY midnight/contracts/sensor-registry ./midnight/contracts/sensor-registry
COPY shared/measurement-protocol ./shared/measurement-protocol

RUN npm ci --workspace @midnight-demo/sponsor-wallet --include-workspace-root=false
RUN npm run build -w @midnight-demo/sponsor-wallet
RUN npm prune --omit=dev --workspace @midnight-demo/sponsor-wallet

ENV NODE_ENV=production
ENV SPONSOR_ZK_CONFIG_PATH=/app/midnight/contracts/sensor-registry/src/managed/sensor-registry
RUN test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerDevice.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerDevice.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerPolicyAssignment.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/registerPolicyAssignment.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/closePolicyAssignment.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/closePolicyAssignment.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/rotateOperatorAuthority.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/rotateOperatorAuthority.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/submitDailyAttestation.prover" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/keys/submitDailyAttestation.verifier" \
    && test -f "$SPONSOR_ZK_CONFIG_PATH/contract/index.js"
EXPOSE 8789

CMD ["node", "backend/cloudflare/sponsor-wallet-container/dist/supervisor.js"]
