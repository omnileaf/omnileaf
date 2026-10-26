export const SCREEN_SWEEP_TAG = "@screens";

const TEST_GROUPS = ["screens", "rest"] as const;

export type TestGroup = (typeof TEST_GROUPS)[number];

function isTestGroup(value: string): value is TestGroup {
  return TEST_GROUPS.some((group) => group === value);
}

export function testGroupFromEnvironment(
  value: string | undefined,
): TestGroup | null {
  if (value === undefined) {
    return null;
  }
  if (!isTestGroup(value)) {
    throw new Error(
      `PLAYWRIGHT_GROUP must be ${TEST_GROUPS.join(" or ")}, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}
