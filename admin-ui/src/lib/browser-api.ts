import { createApi } from "#lib/api.ts";
import { LOGIN_PATH } from "#lib/paths.ts";

export function goToSignIn(): void {
  globalThis.location.assign(LOGIN_PATH);
}

export function reloadPage(): void {
  globalThis.location.reload();
}

export const api = createApi({
  fetch: (input, init) => globalThis.fetch(input, init),
  onSignedOut: goToSignIn,
});
