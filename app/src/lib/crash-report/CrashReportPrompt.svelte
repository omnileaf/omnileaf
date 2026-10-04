<script lang="ts">
  import { Bug } from "@lucide/svelte";

  import type { CrashOrigin } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import type { CrashReporting } from "./crash-reporting.svelte";
  import ReportDetails from "./ReportDetails.svelte";

  let { reporting }: { reporting: CrashReporting } = $props();

  const DIALOG_ICON_SIZE = 24;

  const TITLES = {
    panic: m.crash_report_title_last_time,
    interface: m.crash_report_title_now,
  } satisfies Record<CrashOrigin, () => string>;

  const titleId = $props.id();
  const bodyId = `${titleId}-body`;

  const asking = $derived(
    reporting.prompt.kind === "asking" ? reporting.prompt : undefined,
  );

  function openModally(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-prompt-title]")?.focus();
    return () => {
      dialog.close();
    };
  }

  function send(): void {
    void reporting.sendThisTime();
  }

  function decline(): void {
    void reporting.decline();
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
    class="m-auto overflow-y-auto rounded-dialog border-none bg-background p-xl text-foreground shadow-dialog inline-full max-inline-crash-report backdrop:bg-scrim"
  >
    <div class="flex flex-col gap-dialog-gap">
      <span
        class="flex items-center justify-center rounded-dialog-icon bg-chip block-dialog-icon inline-dialog-icon"
      >
        <Bug size={DIALOG_ICON_SIZE} />
      </span>
      <h2
        id={titleId}
        tabindex="-1"
        data-prompt-title
        class="text-title font-extrabold"
      >
        {TITLES[asking.origin]()}
      </h2>
      <p id={bodyId} class="text-label text-muted">
        {m.crash_report_body()}
      </p>
      <ReportDetails details={asking.details} />
      <div class="mbs-xs flex flex-wrap items-center gap-sm">
        <span class="flex-1"></span>
        <button
          type="button"
          class="rounded-dialog-button border border-border px-list-row text-footnote font-semibold min-block-dialog-button touch:min-block-touch-target"
          onclick={decline}
        >
          {m.crash_report_decline()}
        </button>
        <button
          type="button"
          class="rounded-dialog-button bg-accent px-lg text-footnote font-bold text-on-accent min-block-dialog-button touch:min-block-touch-target"
          onclick={send}
        >
          {m.crash_report_send()}
        </button>
      </div>
    </div>
  </dialog>
{/if}
