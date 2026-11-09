import type { Api } from "#lib/api.ts";
import { describeError } from "#lib/error-copy.ts";

export async function signOut(
  api: Pick<Api, "logout">,
  csrf: string,
  goToSignIn: () => void,
): Promise<string | undefined> {
  const result = await api.logout(csrf);
  if (!result.ok) {
    return describeError(result.error);
  }
  goToSignIn();
  return undefined;
}
