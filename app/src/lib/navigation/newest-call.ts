/** Tauri runs each async command on its own task, so two calls sent together can reach the phone in either order unless each waits for the last. */
export function sendingNewest<T>(
  send: (value: T) => Promise<unknown>,
): (value: T) => void {
  let waiting: { readonly value: T } | undefined;
  let sending: Promise<void> | undefined;

  async function sendWaiting(): Promise<void> {
    try {
      for (let next = waiting; next !== undefined; next = waiting) {
        waiting = undefined;
        await send(next.value);
      }
    } finally {
      sending = undefined;
    }
  }

  return (value) => {
    waiting = { value };
    sending ??= sendWaiting();
  };
}
