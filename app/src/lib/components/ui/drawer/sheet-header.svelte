<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";

  let {
    title,
    doneLabel,
    onDone,
  }: { title: string; doneLabel: string; onDone: () => void } = $props();
</script>

<div
  class="grid grid-cols-sheet-header items-center gap-sm px-sheet-inline pbs-sheet-gap"
>
  <Button
    type="button"
    variant="primary"
    aria-hidden="true"
    tabindex={-1}
    inert
    class="invisible col-start-1 row-start-1"
  >
    {doneLabel}
  </Button>
  <DialogTitle
    class="col-start-2 row-start-1 text-center text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title text-balance wrap-anywhere min-inline-none"
  >
    {title}
  </DialogTitle>
  <Button
    type="button"
    variant="primary"
    class="col-start-3 row-start-1 justify-self-end"
    onclick={onDone}
  >
    {doneLabel}
  </Button>
</div>
