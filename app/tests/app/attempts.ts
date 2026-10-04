function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Retries set-up that can hang or fail outside the app, such as launching a helper on a device. */
export async function withAttempts<T>(
  attempts: number,
  attempt: (number: number) => Promise<T>,
  isRetryable: (error: unknown) => boolean = () => true,
): Promise<T> {
  const failures: unknown[] = [];
  for (let number = 1; number <= attempts; number += 1) {
    try {
      return await attempt(number);
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }
      failures.push(error);
    }
  }
  throw new AggregateError(
    failures,
    `failed ${String(attempts)} times: ${failures.map(messageOf).join("; ")}`,
  );
}
