<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import type { AboutLook } from "./look";
  import type { VersionCopying } from "./version-copying.svelte";

  const LOOKS = {
    phone: "rounded-tile px-md text-accent",
    pane: "rounded-control border border-border bg-card ps-md pe-list-row desktop:text-label desktop:min-block-pointer-button",
  } satisfies Record<AboutLook, string>;

  const ICON_SIZES = { phone: 18, pane: 16 } satisfies Record<
    AboutLook,
    number
  >;

  let { copying, look }: { copying: VersionCopying; look: AboutLook } =
    $props();

  const isCopied = $derived(copying.outcome === "copied");
</script>

<button
  type="button"
  class={[
    "inline-flex items-center gap-sm text-start text-callout font-semibold min-block-touch-target min-inline-none",
    LOOKS[look],
  ]}
  onclick={() => {
    void copying.copy();
  }}
>
  {#if isCopied}
    <Check size={ICON_SIZES[look]} class="shrink-0" />
    <span>{m.about_version_details_copied()}</span>
  {:else}
    <Copy size={ICON_SIZES[look]} class="shrink-0" />
    <span>{m.about_copy_version_details()}</span>
  {/if}
</button>
<span role="status" class="sr-only">
  {#if isCopied}
    {m.about_version_details_copied_status()}
  {/if}
</span>
