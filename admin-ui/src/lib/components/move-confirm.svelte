<script lang="ts">
  import { cn } from "#lib/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { WRAPPING_LABEL } from "#lib/components/wrapping-label.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import { CONFIRM_HINT_ID, CONFIRM_QUESTION_ID } from "#lib/move-ids.ts";
  import type { IssueMoveRequest } from "#lib/moves.ts";
  import { fillTemplate } from "#lib/template.ts";

  let {
    code,
    request,
    onCancel,
    onConfirm,
  }: {
    code: string;
    request: IssueMoveRequest;
    onCancel: () => void;
    onConfirm: () => void;
  } = $props();

  const status = $derived(copy.status[request.status]);
</script>

<div role="group" aria-labelledby={CONFIRM_QUESTION_ID}>
  <p
    id={CONFIRM_QUESTION_ID}
    aria-describedby={CONFIRM_HINT_ID}
    tabindex="-1"
    class={cn("rounded-control text-body font-semibold", FOCUS_RING)}
  >
    {fillTemplate(copy.moves.confirmQuestion, {
      code,
      status,
      issue: request.issue,
    })}
  </p>
  <p id={CONFIRM_HINT_ID} class="mbs-1 text-label text-muted">
    {copy.moves.confirmHint}
  </p>
  <div class="mbs-4 grid gap-2 tablet:grid-cols-2">
    <Button variant="outline" class={WRAPPING_LABEL} onclick={onCancel}>
      {copy.moves.cancel}
    </Button>
    <Button class={WRAPPING_LABEL} onclick={onConfirm}>
      {fillTemplate(copy.moves.confirm, { status })}
    </Button>
  </div>
</div>
