const RETRIED_EVENTS: ReadonlySet<string | undefined> = new Set([
  "pull_request",
  "push",
]);

export function retriesFromEnvironment(env: NodeJS.ProcessEnv): number {
  return env.CI === "true" && RETRIED_EVENTS.has(env.GITHUB_EVENT_NAME) ? 1 : 0;
}
