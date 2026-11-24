export interface HeldReads {
  isHolding: boolean;
  readonly waiting: PromiseWithResolvers<undefined>[];
}

export async function answerOnceReleased(reads: HeldReads): Promise<void> {
  if (!reads.isHolding) {
    return;
  }
  const answer = Promise.withResolvers<undefined>();
  reads.waiting.push(answer);
  await answer.promise;
}

export function releaseEvery(reads: HeldReads): void {
  reads.isHolding = false;
  for (const answer of reads.waiting.splice(0)) {
    answer.resolve(undefined);
  }
}
