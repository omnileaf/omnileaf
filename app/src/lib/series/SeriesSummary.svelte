<script lang="ts">
  import { ChevronDown, ChevronUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;

  let { summary }: { summary: string } = $props();

  const androidPhone = new AndroidPhone();
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
      class="-ms-md px-md font-medium min-block-touch-target expanded:-ms-sm expanded:px-sm expanded:text-small expanded:min-block-pointer-target android:max-medium:rounded-full android:max-medium:text-native-button/native-button android:max-medium:font-native-button android:max-medium:tracking-native-button android:max-medium:text-native-on-button-plain android:max-medium:block-native-button android:max-medium:min-block-native-button"
      onclick={() => {
        isOpen = !isOpen;
      }}
    >
      {isOpen ? m.series_summary_less() : m.series_summary_more()}
      {#if androidPhone.isOn}
        <Icon name={isOpen ? "chevron-up" : "chevron-down"} />
      {:else if isOpen}
        <ChevronUp size={ICON_SIZE} aria-hidden="true" />
      {:else}
        <ChevronDown size={ICON_SIZE} aria-hidden="true" />
      {/if}
    </Button>
  {/if}
</div>
