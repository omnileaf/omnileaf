<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    title,
    detail,
    isClearing,
    onClear,
  }: {
    title: string;
    detail: string;
    isClearing: boolean;
    onClear: () => void;
  } = $props();
</script>

<div class="flex items-center gap-md px-lg py-md">
  <div class="flex flex-1 flex-col gap-2xs min-inline-none">
    <span
      class="text-body font-medium expanded:font-semibold desktop:text-callout"
      >{title}</span
    >
    <span class="text-detail text-muted">{detail}</span>
  </div>
  <Button
    type="button"
    look="outline"
    aria-label="{m.storage_clear()} {title}"
    disabled={isClearing}
    class="shrink-0 rounded-full px-lg text-body font-medium min-block-touch-target disabled:opacity-60 desktop:rounded-shadcn-control desktop:px-md desktop:text-label desktop:min-block-pointer-button"
    onclick={onClear}
  >
    {m.storage_clear()}
  </Button>
</div>
