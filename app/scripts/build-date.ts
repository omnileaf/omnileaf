export interface BuildDateSources {
  readonly sourceDateEpoch: string | undefined;
  readonly commitDate: () => string | undefined;
}

const MS_PER_SECOND = 1000;

function isoOf(date: Date): string | undefined {
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function buildDateOf({
  sourceDateEpoch,
  commitDate,
}: BuildDateSources): string | undefined {
  const epoch = Number(sourceDateEpoch);
  if (sourceDateEpoch !== undefined && Number.isInteger(epoch)) {
    return isoOf(new Date(epoch * MS_PER_SECOND));
  }
  const committed = commitDate();
  return committed === undefined ? undefined : isoOf(new Date(committed));
}
