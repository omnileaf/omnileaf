<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button, type ButtonLook } from "#lib/components/ui/button/index.ts";

  type Kind = Extract<ButtonLook, "primary" | "quiet" | "outline">;

  let {
    kind,
    disabled = false,
    onclick,
    children,
  }: {
    kind: Kind;
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<Button
  type="button"
  look={kind}
  {disabled}
  class={[
    "flex items-center justify-center gap-sm px-xl text-body min-block-touch-target disabled:opacity-60 ios:rounded-ios-button android:rounded-full touch:min-block-touch-button desktop:rounded-button desktop:px-lg desktop:text-label desktop:min-block-pointer-target",
    kind === "primary" && "font-bold",
    kind === "outline" && "enabled:hover:bg-hover enabled:active:bg-pressed",
  ]}
  {onclick}
>
  {@render children()}
</Button>
