import type { ScreenName } from "./screens.ts";

export const BROWSER_SUITES = ["whole", "touched"] as const;

export type BrowserSuite = (typeof BROWSER_SUITES)[number];

export type ShardGroup = "rest" | "screens" | "speed" | "site";

export interface ShardJob {
  readonly group: ShardGroup;
  readonly shard: number;
  readonly of: number;
}

export interface TestListSize {
  readonly lines: number;
  readonly durationMs: number;
}

export interface ShardPlan {
  readonly isAppChanged: boolean;
  readonly isSiteChanged: boolean;
  readonly suite: BrowserSuite;
  readonly screens: readonly ScreenName[] | null;
  readonly touched: Readonly<Record<"rest" | "screens", TestListSize>>;
}

export const TARGET_SHARD_MS = 8 * 60 * 1000;

const EVERY_SCREEN = 3;
const REST_SHARDS_PER_SCREEN = 12;
const SCREENS_SHARDS_PER_SCREEN = 4;
const SINGLE_SHARD = 1;

function isBrowserSuite(value: string): value is BrowserSuite {
  return BROWSER_SUITES.some((suite) => suite === value);
}

export function browserSuiteFromEnvironment(
  value: string | undefined,
): BrowserSuite {
  if (value === undefined) {
    return "whole";
  }
  if (!isBrowserSuite(value)) {
    throw new Error(
      `BROWSER_SUITE must be ${BROWSER_SUITES.join(" or ")}, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export function shardCounts(
  screens: readonly ScreenName[] | null,
): Readonly<Record<"rest" | "screens", number>> {
  const screenCount = screens?.length ?? EVERY_SCREEN;
  return {
    rest: REST_SHARDS_PER_SCREEN * screenCount,
    screens: SCREENS_SHARDS_PER_SCREEN * screenCount,
  };
}

function shardsOf(group: ShardGroup, of: number): ShardJob[] {
  return Array.from({ length: of }, (_, index) => ({
    group,
    shard: index + 1,
    of,
  }));
}

function touchedShardCount(size: TestListSize, wholeCount: number): number {
  if (size.lines === 0) {
    return 0;
  }
  const byDuration = Math.max(
    SINGLE_SHARD,
    Math.ceil(size.durationMs / TARGET_SHARD_MS),
  );
  return Math.min(wholeCount, size.lines, byDuration);
}

function appShards(plan: ShardPlan): ShardJob[] {
  const counts = shardCounts(plan.screens);
  if (plan.suite === "whole") {
    return [
      ...shardsOf("rest", counts.rest),
      ...shardsOf("screens", counts.screens),
      ...shardsOf("speed", SINGLE_SHARD),
    ];
  }
  return [
    ...shardsOf("rest", touchedShardCount(plan.touched.rest, counts.rest)),
    ...shardsOf(
      "screens",
      touchedShardCount(plan.touched.screens, counts.screens),
    ),
  ];
}

export function shardMatrix(plan: ShardPlan): ShardJob[] {
  return [
    ...(plan.isAppChanged ? appShards(plan) : []),
    ...(plan.isSiteChanged ? shardsOf("site", SINGLE_SHARD) : []),
  ];
}
