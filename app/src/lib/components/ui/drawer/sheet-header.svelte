<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  const CENTRED = {
    row: "grid grid-cols-sheet-header items-center gap-sm px-sheet-inline pbs-sheet-gap",
    heading:
      "col-start-2 row-start-1 flex flex-col items-center text-center min-inline-none",
    subtitle: "text-footnote",
    done: "primary",
    isBalanced: true,
  } as const;

  const AT_START = {
    row: "flex items-center gap-md ps-lg pe-md pbs-sheet-gap",
    heading: "flex flex-1 flex-col text-start min-inline-none",
    subtitle: "text-small",
    done: "plain",
    isBalanced: false,
  } as const;

  let {
    title,
    subtitle,
    doneLabel,
    onDone,
  }: {
    title: string;
    subtitle?: string;
    doneLabel: string;
    onDone: () => void;
  } = $props();

  const look = currentPlatform() === "android" ? AT_START : CENTRED;
</script>

<div class={look.row}>
  {#if look.isBalanced}
    <Button
      type="button"
      variant={look.done}
      aria-hidden="true"
      tabindex={-1}
      inert
      class="invisible col-start-1 row-start-1"
    >
      {doneLabel}
    </Button>
  {/if}
  <div class={look.heading}>
    <DialogTitle
      class="text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title text-balance wrap-anywhere"
    >
      {title}
    </DialogTitle>
    {#if subtitle !== undefined}
      <p class={["truncate text-muted max-inline-full", look.subtitle]}>
        {subtitle}
      </p>
    {/if}
  </div>
  <Button
    type="button"
    variant={look.done}
    class="col-start-3 row-start-1 justify-self-end"
    onclick={onDone}
  >
    {doneLabel}
  </Button>
</div>
