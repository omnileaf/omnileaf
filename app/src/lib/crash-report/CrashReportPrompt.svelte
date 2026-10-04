<script lang="ts">
  import { Bug } from "@lucide/svelte";

  import type { CrashOrigin } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import AlwaysSendChoice from "./AlwaysSendChoice.svelte";

  import type { CrashReporting } from "./crash-reporting.svelte";
  import ReportDetails from "./ReportDetails.svelte";
  import ReportFailures from "./ReportFailures.svelte";

  let { reporting }: { reporting: CrashReporting } = $props();

  const DIALOG_BADGE_ICON_SIZE = 18;

  const TITLES = {
    panic: m.crash_report_title_last_time,
    interface: m.crash_report_title_now,
  } satisfies Record<CrashOrigin, () => string>;

  const titleId = $props.id();
  const bodyId = `${titleId}-body`;

  let alwaysSend = $state(false);

  const asking = $derived(
    reporting.prompt.kind === "asking" ? reporting.prompt : undefined,
  );
  const isCopied = $derived(reporting.copying.outcome === "copied");

  function openModally(dialog: HTMLDialogElement): () => void {
    alwaysSend = false;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-prompt-title]")?.focus();
    return () => {
      dialog.close();
    };
  }

  function send(): void {
    void (alwaysSend ? reporting.sendAlways() : reporting.sendThisTime());
  }

  function decline(): void {
    void reporting.decline();
  }

  function copy(): void {
    void reporting.copying.copy();
  }
</script>

{#if asking !== undefined}
  <dialog
    {@attach openModally}
    role="alertdialog"
    aria-labelledby={titleId}
    aria-describedby={bodyId}
    oncancel={(event) => {
      event.preventDefault();
      decline();
    }}
    class="m-auto overflow-y-auto rounded-dialog border border-dialog-edge bg-card p-dialog-inset text-foreground shadow-dialog inline-full max-inline-crash-report backdrop:bg-scrim"
  >
    <div class="flex flex-col gap-dialog-gap">
      <div class="flex items-center gap-md">
        <span
          aria-hidden="true"
          data-prompt-badge
          class="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent block-dialog-badge inline-dialog-badge"
        >
          <Bug size={DIALOG_BADGE_ICON_SIZE} />
        </span>
        <h2
          id={titleId}
          tabindex="-1"
          data-prompt-title
          class="text-dialog-title font-bold"
        >
          {TITLES[asking.origin]()}
        </h2>
      </div>
      <p id={bodyId} class="-mbs-xs text-dialog-body text-muted">
        {m.crash_report_body()}
      </p>
      <ReportDetails details={asking.details} />
      <AlwaysSendChoice bind:checked={alwaysSend} />
      <div class="mbs-xs flex flex-wrap items-center gap-sm">
        <button
          type="button"
          class="rounded-dialog-button border border-border px-list-row text-footnote font-semibold min-block-dialog-button touch:min-block-touch-target"
          onclick={copy}
        >
          {isCopied ? m.crash_report_copied() : m.crash_report_copy()}
        </button>
        <span class="flex-1"></span>
        <button
          type="button"
          class="rounded-dialog-button border border-border px-lg text-label font-semibold min-block-dialog-button touch:min-block-touch-target"
          onclick={decline}
        >
          {m.crash_report_decline()}
        </button>
        <button
          type="button"
          class="rounded-dialog-button bg-accent px-lg text-label font-semibold text-on-accent min-block-dialog-button touch:min-block-touch-target"
          onclick={send}
        >
          {m.crash_report_send()}
        </button>
      </div>
      <ReportFailures {reporting} />
    </div>
    <span role="status" class="sr-only">
      {#if isCopied}
        {m.crash_report_copied_status()}
      {/if}
    </span>
  </dialog>
{/if}
