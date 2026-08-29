interface Env {
  DB: D1Database;
  AUTH_RATE_LIMITER: RateLimit;
  API_RATE_LIMITER: RateLimit;
  PROOF_RATE_LIMITER: RateLimit;
  SPONSOR_WALLET_SEED?: string;
  PUBLIC_MIDNIGHT_NETWORK?: string;
  PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?: string;
}

declare namespace Cloudflare {
  interface Env {
    SPONSOR_WALLET_SEED?: string;
  }
}
