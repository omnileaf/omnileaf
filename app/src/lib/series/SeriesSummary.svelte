<script lang="ts">
  import { ChevronDown, ChevronUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;

  let { summary }: { summary: string } = $props();

  const summaryId = $props.id();
  let text: HTMLElement | undefined = $state();
  let isOpen = $state(false);
  let isFolded = $state(false);

  $effect(() => {
    if (text === undefined) {
      return undefined;
    }
    const shown = text;
    const measure = new ResizeObserver(() => {
      isFolded = shown.scrollHeight > shown.clientHeight;
    });
    measure.observe(shown);
    return () => {
      measure.disconnect();
    };
  });
</script>

<div class="flex flex-col items-start gap-xs">
  <p
    bind:this={text}
    id={summaryId}
    class={["text-body expanded:text-small", !isOpen && "line-clamp-2"]}
  >
    {summary}
  </p>
  {#if isFolded || isOpen}
    <Button
      look="bar-icon"
      aria-expanded={isOpen}
      aria-controls={summaryId}
      class="-ms-md px-md font-medium min-block-touch-target expanded:-ms-sm expanded:px-sm expanded:text-small expanded:min-block-pointer-target"
      onclick={() => {
        isOpen = !isOpen;
      }}
    >
      {isOpen ? m.series_summary_less() : m.series_summary_more()}
      {#if isOpen}
        <ChevronUp size={ICON_SIZE} aria-hidden="true" />
      {:else}
        <ChevronDown size={ICON_SIZE} aria-hidden="true" />
      {/if}
    </Button>
  {/if}
</div>
