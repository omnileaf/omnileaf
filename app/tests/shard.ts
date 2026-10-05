export type Shard = { current: number; total: number };

const CURRENT_OVER_TOTAL = /^(\d+)\/(\d+)$/;
const FIRST_SHARD = 1;

export function shardFromEnvironment(value: string | undefined): Shard | null {
  if (value === undefined) {
    return null;
  }
  const [, current, total] = CURRENT_OVER_TOTAL.exec(value) ?? [];
  const shard = { current: Number(current), total: Number(total) };
  if (
    current === undefined ||
    shard.current < FIRST_SHARD ||
    shard.total < shard.current
  ) {
    throw new Error(
      `PLAYWRIGHT_SHARD must be current/total with 1 <= current <= total, got ${JSON.stringify(value)}`,
    );
  }
  return shard;
}
