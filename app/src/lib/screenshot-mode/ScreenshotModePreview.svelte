<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import PreviewSide from "./PreviewSide.svelte";

  let { isOn }: { readonly isOn: boolean } = $props();

  const ARROW_SIZE = 20;
</script>

<div role="img" aria-label={m.screenshot_mode_preview_label()}>
  <div inert class="flex items-center gap-sm expanded:items-start">
    <PreviewSide showsStandIn={false} isActive={!isOn} />
    <ArrowRight
      size={ARROW_SIZE}
      class="shrink-0 text-faint expanded:self-center rtl:-scale-x-100"
    />
    <PreviewSide showsStandIn={true} isActive={isOn} />
  </div>
</div>
