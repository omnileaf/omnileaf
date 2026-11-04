<script lang="ts">
  import type { MoveProps } from "#lib/move-props.ts";
  import MoveProblem from "#lib/components/move-problem.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { WRAPPING_LABEL } from "#lib/components/wrapping-label.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Label } from "#lib/components/ui/label/index.ts";
  import { copy } from "#lib/copy.ts";
  import { isBusy } from "#lib/move-state.ts";
  import {
    ISSUE_ERROR_ID,
    ISSUE_FIELD_ID,
    ISSUE_HINT_ID,
    moveButtonId,
  } from "#lib/move-ids.ts";
  import { allowedMoves, MOVE_TARGETS, needsIssue } from "#lib/moves.ts";
  import type { StatusKind } from "#lib/wire.ts";

  let { status, move }: { status: StatusKind; move: MoveProps } = $props();

  const current = $derived(move.state);
  const busy = $derived(isBusy(current));
  const allowed = $derived(allowedMoves(status));
  const issueOpen = $derived(allowed.some(needsIssue));
  const issueMessage = $derived(
    current.kind === "issueInvalid" ? current.message : undefined,
  );

  function typed(event: Event & { currentTarget: HTMLInputElement }): void {
    move.onDraftChange(event.currentTarget.value);
  }
</script>

{#if current.kind === "problem"}
  <MoveProblem
    message={current.message}
    recoveries={current.recoveries}
    onRetry={move.onRetry}
    onReload={move.onReload}
  />
{/if}

<div class="grid gap-1.5">
  <Label for={ISSUE_FIELD_ID}>{copy.moves.issueLabel}</Label>
  <Input
    id={ISSUE_FIELD_ID}
    inputmode="numeric"
    autocomplete="off"
    value={move.draft}
    oninput={typed}
    disabled={busy || !issueOpen}
    aria-invalid={issueMessage === undefined ? undefined : "true"}
    aria-describedby={issueMessage === undefined
      ? ISSUE_HINT_ID
      : `${ISSUE_HINT_ID} ${ISSUE_ERROR_ID}`}
  />
  <p id={ISSUE_HINT_ID} class="text-label text-muted">
    {copy.moves.issueHint}
  </p>
  {#if issueMessage !== undefined}
    <p id={ISSUE_ERROR_ID} class="text-label font-medium">{issueMessage}</p>
  {/if}
</div>

{#if status === "closed"}
  <p class="mbs-3 text-label text-muted">{copy.moves.closedHint}</p>
{/if}

<div class="mbs-4 grid grid-cols-2 gap-2">
  {#each MOVE_TARGETS as target (target)}
    <Button
      id={moveButtonId(target)}
      variant="outline"
      class={WRAPPING_LABEL}
      disabled={busy || !allowed.includes(target)}
      onclick={() => {
        move.onChoose(target);
      }}
    >
      {copy.status[target]}
    </Button>
  {/each}
</div>
