export interface Debouncer<T> {
  schedule(value: T): void;
  cancel(): void;
}

export function debounce<T>(
  action: (value: T) => void,
  delayMs: number,
): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule: (value) => {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        action(value);
      }, delayMs);
    },
    cancel,
  };
}
