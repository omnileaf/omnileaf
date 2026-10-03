<script lang="ts">
  import { ArrowLeft, Bug, ChevronLeft } from "@lucide/svelte";

  import type { CrashOrigin } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import AlwaysSendChoice from "./AlwaysSendChoice.svelte";

  import type { CrashReporting } from "./crash-reporting.svelte";
  import ReportDetails from "./ReportDetails.svelte";
  import ReportFailures from "./ReportFailures.svelte";

  let { reporting, onPhone }: { reporting: CrashReporting; onPhone: boolean } =
    $props();

  const PHONE_ICON_SIZE = 28;
  const DIALOG_ICON_SIZE = 24;
  const BACK_ARROW_SIZE = 24;
  const BACK_CHEVRON_SIZE = 22;

  const TITLES = {
    panic: m.crash_report_title_last_time,
    interface: m.crash_report_title_now,
  } satisfies Record<CrashOrigin, () => string>;
  const PHONE_BODIES = {
    panic: m.crash_report_body_last_time,
    interface: m.crash_report_body,
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
    class={[
      "border-none text-foreground",
      onPhone
        ? "inset-none m-none overflow-y-auto bg-background block-dvh inline-full max-block-full max-inline-full"
        : "m-auto overflow-y-auto rounded-dialog bg-background p-xl shadow-dialog inline-full max-inline-dialog backdrop:bg-scrim",
    ]}
  >
    {#if onPhone}
      <div
        class="flex flex-col ps-safe-start pe-safe-end pbs-safe-top pbe-safe-bottom min-block-full"
      >
        <header class="mbs-sm flex items-center gap-xs ps-sm">
          <button
            type="button"
            aria-label={m.crash_report_decline()}
            class="flex items-center justify-center rounded-full block-touch-target inline-touch-target"
            onclick={decline}
          >
            <ArrowLeft
              size={BACK_ARROW_SIZE}
              class="hidden rtl:-scale-x-100 android:block"
            />
            <ChevronLeft
              size={BACK_CHEVRON_SIZE}
              class="rtl:-scale-x-100 android:hidden"
            />
          </button>
          <span class="text-callout font-semibold">{m.app_name()}</span>
        </header>
        <div
          class="flex flex-col items-start gap-dialog-gap px-problem-inset pbs-problem-top pbe-xl"
        >
          <span
            class="flex items-center justify-center rounded-problem-icon bg-chip block-problem-icon inline-problem-icon"
          >
            <Bug size={PHONE_ICON_SIZE} />
          </span>
          <h1
            id={titleId}
            tabindex="-1"
            data-prompt-title
            class="text-problem-title font-extrabold"
          >
            {m.crash_report_title_now()}
          </h1>
          <p id={bodyId} class="text-callout text-foreground/85">
            {PHONE_BODIES[asking.origin]()}
          </p>
          <ReportDetails details={asking.details} {onPhone} />
          <AlwaysSendChoice bind:checked={alwaysSend} {onPhone} />
          <div class="mbs-sm flex flex-col gap-sm self-stretch">
            <button
              type="button"
              class="rounded-full bg-accent text-callout font-bold text-on-accent min-block-problem-button"
              onclick={send}
            >
              {m.crash_report_send_phone()}
            </button>
            <button
              type="button"
              class="rounded-full border border-quiet-edge text-callout font-bold min-block-problem-button"
              onclick={copy}
            >
              {isCopied ? m.crash_report_copied() : m.crash_report_copy()}
            </button>
          </div>
          <ReportFailures {reporting} />
        </div>
      </div>
    {:else}
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
        <ReportDetails details={asking.details} {onPhone} />
        <AlwaysSendChoice bind:checked={alwaysSend} {onPhone} />
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
        <ReportFailures {reporting} />
      </div>
    {/if}
    <span role="status" class="sr-only">
      {#if isCopied}
        {m.crash_report_copied_status()}
      {/if}
    </span>
  </dialog>
{/if}
