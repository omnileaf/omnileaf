import type { Api } from "#lib/api.ts";
import { signOut } from "#lib/sign-out.ts";

export type SignOutState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "failed"; readonly message: string };

export class SignOutControl {
  state: SignOutState = $state.raw({ kind: "idle" });

  readonly #api: Pick<Api, "logout">;
  readonly #goToSignIn: () => void;

  constructor(api: Pick<Api, "logout">, goToSignIn: () => void) {
    this.#api = api;
    this.#goToSignIn = goToSignIn;
  }

  async run(csrf: string): Promise<void> {
    if (this.state.kind === "pending") {
      return;
    }
    this.state = { kind: "pending" };
    const problem = await signOut(this.#api, csrf, this.#goToSignIn);
    this.state =
      problem === undefined
        ? { kind: "pending" }
        : { kind: "failed", message: problem };
  }

  clear(): void {
    if (this.state.kind === "failed") {
      this.state = { kind: "idle" };
    }
  }
}
