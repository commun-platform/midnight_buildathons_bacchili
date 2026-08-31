import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';

type CircuitProvingProvider = ReturnType<typeof httpClientProvingProvider>;

export function refreshingProvingProvider(
  provider: () => Promise<CircuitProvingProvider>,
): CircuitProvingProvider {
  return {
    async check(...arguments_: Parameters<CircuitProvingProvider['check']>) {
      return (await provider()).check(...arguments_);
    },
    async prove(...arguments_: Parameters<CircuitProvingProvider['prove']>) {
      return (await provider()).prove(...arguments_);
    },
  } satisfies CircuitProvingProvider;
}
