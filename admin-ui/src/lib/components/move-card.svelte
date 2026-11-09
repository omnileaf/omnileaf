<script lang="ts">
  import Lock from "@lucide/svelte/icons/lock";
  import { tick } from "svelte";

  import { focusMoveTarget } from "#lib/browser-focus.ts";
  import { cn } from "#lib/cn.ts";
  import MoveConfirm from "#lib/components/move-confirm.svelte";
  import MoveForm from "#lib/components/move-form.svelte";
  import type { MoveProps } from "#lib/move-props.ts";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import { STATUS_ID } from "#lib/move-ids.ts";
  import { MoveFocusTracker } from "#lib/move-focus.ts";
  import { statusText } from "#lib/move-state.ts";
  import { allowedMoves } from "#lib/moves.ts";
  import type { Status } from "#lib/wire.ts";

  let {
    code,
    status,
    move,
  }: { code: string; status: Status; move: MoveProps } = $props();

  const tracker = new MoveFocusTracker(focusMoveTarget, tick);

  const current = $derived(move.state);
  const words = $derived(statusText(current));
  const isFinal = $derived(allowedMoves(status.kind).length === 0);

  $effect(() => {
    void tracker.observe(current);
  });
</script>

<Card>
  <CardHeader>
    <CardTitle>{copy.moves.title}</CardTitle>
    <CardDescription>{copy.moves.hint}</CardDescription>
  </CardHeader>
  <CardContent>
    <p
      id={STATUS_ID}
      tabindex="-1"
      role="status"
      aria-live="polite"
      class={cn(
        "rounded-control text-small text-muted",
        words === "" ? "sr-only" : "mbe-3",
        FOCUS_RING,
      )}
    >
      {words}
    </p>
    {#if isFinal}
      <Alert icon={Lock} role="note">
        <AlertTitle>{copy.moves.finalTitle}</AlertTitle>
        <AlertDescription>{copy.moves.finalHint}</AlertDescription>
      </Alert>
    {:else if current.kind === "confirming"}
      <MoveConfirm
        {code}
        request={current.request}
        onCancel={move.onCancel}
        onConfirm={move.onConfirm}
      />
    {:else}
      <MoveForm status={status.kind} {move} />
    {/if}
  </CardContent>
</Card>
