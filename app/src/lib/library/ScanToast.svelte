<script lang="ts">
  import { CircleCheck } from "@lucide/svelte";

  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import type { FolderScan } from "#lib/ipc/bindings.ts";
  import { NOTICE_WINDOW_MS, type ToastHandle } from "#lib/notices/notices.ts";
  import ToastCard, { TOAST_ICON_SIZE } from "#lib/notices/ToastCard.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";
  import { scanCount, scanFill } from "./scan-count.svelte";
  import type { ScanStep } from "./scan-step";

  let {
    adding,
    toast,
    folderName,
    problemsIn,
    onShow,
  }: {
    adding: FolderAdding;
    toast: ToastHandle;
    folderName: (scan: FolderScan) => string;
    problemsIn: (scan: FolderScan) => string | undefined;
    onShow: (() => void) | undefined;
  } = $props();

  const NOT_STARTED: ScanStep = { kind: "finding", found: 0 };

  const id = $props.id();
  const titleId = `${id}-title`;
  const countId = `${id}-count`;

  let finished: FolderScan | undefined = $state();

  const step: ScanStep = $derived(
    adding.outcome.kind === "finding" || adding.outcome.kind === "reading"
      ? adding.outcome
      : NOT_STARTED,
  );
  const count = scanCount(() => step);

  function settle(scan: FolderScan): void {
    if (scan.books === 0) {
      toast.dismiss();
    } else {
      toast.lapse(NOTICE_WINDOW_MS);
    }
  }

  $effect(() => {
    if (finished !== undefined) {
      return;
    }
    const { outcome } = adding;
    if (outcome.kind === "scanned") {
      finished = outcome.scan;
      settle(outcome.scan);
    } else if (outcome.kind === "idle" || outcome.kind === "adding") {
      toast.dismiss();
    }
  });
</script>

{#if finished === undefined}
  <ToastCard tone="plain" title={findingTitle} onDismiss={toast.dismiss}>
    {#snippet icon()}
      <Spinner
        size={TOAST_ICON_SIZE}
        class="text-accent android:text-android-inverse-primary"
      />
    {/snippet}
    <Progress
      aria-labelledby={titleId}
      aria-describedby={count.label === undefined ? undefined : countId}
      {...scanFill(step)}
      class="mbs-xs block-progress-compact"
    />
  </ToastCard>
{:else}
  <ToastCard
    tone="plain"
    title={m.library_scan_added({
      books: finished.books,
      name: folderName(finished),
    })}
    body={problemsIn(finished)}
    action={onShow === undefined
      ? undefined
      : { label: m.library_scan_show(), run: onShow }}
    onDismiss={toast.dismiss}
  >
    {#snippet icon()}
      <CircleCheck
        size={TOAST_ICON_SIZE}
        class="text-accent android:text-android-inverse-primary"
      />
    {/snippet}
  </ToastCard>
{/if}

{#snippet findingTitle()}
  <span id={titleId}>{m.library_scan_finding()}</span>
  {#if count.label !== undefined}
    <span aria-hidden="true">·</span>
    <span aria-hidden="true" id={countId} class="tabular-nums"
      >{count.label}</span
    >
  {/if}
{/snippet}
