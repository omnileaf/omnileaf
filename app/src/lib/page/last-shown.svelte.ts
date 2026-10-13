/** Follows what `read` returns but holds on to its last value once it turns undefined, so a closing dialog keeps showing what it asked about. */
export function lastShown<T>(read: () => T | undefined): {
  readonly current: T | undefined;
} {
  let last: T | undefined = $state();
  $effect.pre(() => {
    const value = read();
    if (value !== undefined) {
      last = value;
    }
  });
  return {
    get current() {
      return last;
    },
  };
}
