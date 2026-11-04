import { createApi } from "#lib/api.ts";
import { LOGIN_PATH } from "#lib/paths.ts";

export const api = createApi({
  fetch: (input, init) => globalThis.fetch(input, init),
  onSignedOut: () => {
    globalThis.location.assign(LOGIN_PATH);
  },
});
