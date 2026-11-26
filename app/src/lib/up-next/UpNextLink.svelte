<script lang="ts">
  import { mergeProps } from "bits-ui";
  import type { Snippet } from "svelte";

  import type { ResolvedPathname } from "$app/types";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { movesWithinReader } from "#lib/reader/reader-origin.ts";

  interface KeyHint {
    readonly label: string;
    readonly keys: readonly string[];
    readonly shortcut: string;
  }

  let {
    href,
    class: className,
    replaceState = false,
    hint,
    children,
  }: {
    href: ResolvedPathname;
    class: string;
    replaceState?: boolean;
    hint?: KeyHint;
    children: Snippet;
  } = $props();

  const isWindows = currentPlatform() === "windows";
  const anchor = $derived({
    href,
    class: className,
    onclick: replaceState ? movesWithinReader(href) : undefined,
    "aria-keyshortcuts": isWindows ? hint?.shortcut : undefined,
  });
</script>

{#if isWindows && hint !== undefined}
  <Tooltip label={hint.label} keys={hint.keys}>
    {#snippet child({ props })}
      <a {...mergeProps(props, anchor)}>{@render children()}</a>
    {/snippet}
  </Tooltip>
{:else}
  <a {...anchor}>{@render children()}</a>
{/if}
