import { appendFileSync } from "node:fs";

export function writeStepSummary(
  env: NodeJS.ProcessEnv,
  markdown: string,
): void {
  if (env.GITHUB_STEP_SUMMARY === undefined) {
    console.log(markdown);
    return;
  }
  appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
}

export function setStepOutput(
  env: NodeJS.ProcessEnv,
  name: string,
  value: string,
): void {
  if (env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}
