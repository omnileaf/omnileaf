export const SKELETON_DELAY_MS = 200;

export class SkeletonDelay {
  isDue = $state(false);

  dueNow(): void {
    this.isDue = true;
  }

  wait(): () => void {
    const timer = setTimeout(() => {
      this.isDue = true;
    }, SKELETON_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }
}
