export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: { attempts: number; delayMs: number },
): Promise<T> {
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error('attempts must be a positive integer');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
    }
  }
  throw lastError;
}
