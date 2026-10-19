<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";
  import { Popover } from "bits-ui";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { PopoverContent } from "#lib/components/ui/popover/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import type { Problem } from "./needs-attention.svelte";
  import NeedsAttentionList from "./NeedsAttentionList.svelte";

  const ICON_SIZE = 22;

  let {
    problems,
    usesStandIns,
    isFolded,
    onFix,
  }: {
    problems: readonly Problem[];
    usesStandIns: boolean;
    isFolded: boolean;
    onFix: (problem: Problem) => void;
  } = $props();

  const titleId = $props.id();
  const count = $derived(problems.length);
  const numbers = $derived(new Intl.NumberFormat(getLocale()));

  let button = $state<HTMLElement | null>(null);
  let isOpen = $state(false);

  function focusButton(event: Event): void {
    event.preventDefault();
    button?.focus();
  }
</script>

<Tooltip
  bind:ref={button}
  label={isFolded ? m.attention_title() : undefined}
  side={document.documentElement.dir === "rtl" ? "left" : "right"}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={m.attention_count_label({ count })}
  onclick={() => {
    isOpen = true;
  }}
>
  {#snippet child({ props })}
    <button
      {...props}
      class={[
        "relative flex flex-row items-center gap-sm rounded-sidebar-row px-sm text-label font-regular transition-control block-sidebar-row inline-full min-block-sidebar-row hover:bg-sidebar-accent hover:text-on-sidebar-accent sidebar-hidden:justify-center sidebar-hidden:px-none",
        isOpen
          ? "bg-sidebar-accent text-on-sidebar-accent"
          : "text-muted expanded:text-sidebar-ink",
      ]}
    >
      <span class="relative flex items-center justify-center">
        <CircleAlert
          size={ICON_SIZE}
          class="block-sidebar-icon inline-sidebar-icon"
        />
        <span
          class="absolute -inset-e-2xs -inset-be-2xs hidden rounded-full bg-accent ring-2 ring-sidebar block-active-dot inline-active-dot sidebar-hidden:block"
        ></span>
      </span>
      <span class="flex-1 truncate text-start sidebar-hidden:sr-only"
        >{m.attention_title()}</span
      >
      <Badge
        look="count"
        class="px-sm py-2xs text-caption sidebar-hidden:hidden"
      >
        {numbers.format(count)}
      </Badge>
    </button>
  {/snippet}
</Tooltip>

<Popover.Root bind:open={isOpen}>
  <PopoverContent
    customAnchor={button}
    side={document.documentElement.dir === "rtl" ? "left" : "right"}
    align="end"
    aria-labelledby={titleId}
    class="flex flex-col gap-sm p-lg inline-attention-popover max-inline-full"
    onCloseAutoFocus={focusButton}
  >
    <h2 id={titleId} class="text-label font-semibold">
      {m.attention_title()}
    </h2>
    <NeedsAttentionList
      {problems}
      {usesStandIns}
      onFix={(problem: Problem) => {
        isOpen = false;
        onFix(problem);
      }}
    />
  </PopoverContent>
</Popover.Root>
