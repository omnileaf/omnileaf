import type { HTMLButtonAttributes } from "svelte/elements";

import type { WithElementRef } from "#lib/components/ui/types.ts";

import type { ButtonSize, ButtonVariant } from "./variants.ts";

type NamedIconButton =
  | { size: "icon"; "aria-label": string }
  | { size: "icon"; "aria-labelledby": string };

export type ButtonProps = WithElementRef<
  HTMLButtonAttributes,
  HTMLButtonElement
> & { variant?: ButtonVariant } & (
    { size?: Exclude<ButtonSize, "icon"> } | NamedIconButton
  );
