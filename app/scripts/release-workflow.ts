export interface WorkflowStep {
  readonly text: string;
  readonly isGated: boolean;
  readonly readsSecrets: boolean;
}

const GATE = /^\s*if:\s.*configured == 'true'/mu;

export function jobSteps(workflow: string, job: string): WorkflowStep[] {
  const jobStart = workflow.search(new RegExp(`^  ${job}:$`, "mu"));
  if (jobStart === -1) {
    throw new Error(`the workflow has no job ${job}`);
  }
  const rest = workflow.slice(jobStart + 1);
  const next = rest.search(/^ {2}[a-z][a-z-]*:$/mu);
  const body = next === -1 ? rest : rest.slice(0, next);
  const steps = body.split(/\n {6}- /u).slice(1);
  return steps.map((text) => ({
    text,
    isGated: GATE.test(text),
    readsSecrets: /\$\{\{\s*secrets\./u.test(text),
  }));
}

export function ungatedSigningSteps(
  workflow: string,
  job: string,
  checkStep: string,
): string[] {
  const [, ...afterCheck] = jobSteps(workflow, job).filter(
    (step, index, all) =>
      index >= all.findIndex((one) => one.text.includes(checkStep)),
  );
  return afterCheck
    .filter((step) => !step.isGated)
    .map((step) => step.text.split("\n")[0] ?? "");
}
