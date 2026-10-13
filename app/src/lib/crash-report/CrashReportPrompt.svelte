<script lang="ts">
  import { ArrowLeft, Bug, ChevronLeft } from "@lucide/svelte";
  import { AlertDialog } from "bits-ui";

  import {
    DialogContent,
    DialogTitle,
  } from "#lib/components/ui/dialog/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";

  import type { CrashOrigin } from "#lib/ipc/bindings.ts";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import AlwaysSendChoice from "./AlwaysSendChoice.svelte";

  import type { CrashReporting } from "./crash-reporting.svelte";
  import type { PromptLook } from "./look";
  import ReportDetails from "./ReportDetails.svelte";
  import ReportFailures from "./ReportFailures.svelte";

  let { reporting, look }: { reporting: CrashReporting; look: PromptLook } =
    $props();

  const LOOKS = {
    phone:
      "inset-none overflow-auto bg-background block-dvh inline-full max-block-full",
    dialog:
      "inset-none m-auto overflow-auto rounded-dialog border border-dialog-edge bg-card p-dialog-inset shadow-dialog block-fit inline-full max-block-dialog-limit max-inline-crash-report",
  } satisfies Record<PromptLook, string>;

  const PHONE_BADGE_ICON_SIZE = 20;
  const DIALOG_BADGE_ICON_SIZE = 18;
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

  let alwaysSend = $state(false);
  let content: HTMLElement | null = $state(null);

  const asking = $derived(
    reporting.prompt.kind === "asking" ? reporting.prompt : undefined,
  );
  const shown = lastShown(() => asking);
  const isCopied = $derived(reporting.copying.outcome === "copied");

  function startAsking(event: Event): void {
    event.preventDefault();
    alwaysSend = false;
    content?.querySelector<HTMLElement>("[data-prompt-title]")?.focus();
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

<AlertDialog.Root
  bind:open={
    () => asking !== undefined,
    (open: boolean) => {
      if (!open) {
        decline();
      }
    }
  }
>
  <DialogContent
    bind:ref={content}
    class={["text-foreground fade-motion", LOOKS[look]]}
    interactOutsideBehavior="ignore"
    onOpenAutoFocus={startAsking}
  >
    {#if shown.current !== undefined}
      {@const offer = shown.current}
      {#if look === "phone"}
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
            class="flex flex-col items-start gap-dialog-gap px-crash-screen-inset pbs-crash-screen-top pbe-xl"
          >
            <div class="flex items-center gap-md">
              <span
                aria-hidden="true"
                data-prompt-badge
                class="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent block-crash-screen-badge inline-crash-screen-badge"
              >
                <Bug size={PHONE_BADGE_ICON_SIZE} />
              </span>
              <DialogTitle
                level={1}
                tabindex={-1}
                data-prompt-title
                class="text-crash-screen-title font-bold tracking-tight"
              >
                {m.crash_report_title_now()}
              </DialogTitle>
            </div>
            <AlertDialog.Description class="text-crash-screen-body text-muted">
              {PHONE_BODIES[offer.origin]()}
            </AlertDialog.Description>
            <ReportDetails details={offer.details} />
            <AlwaysSendChoice bind:checked={alwaysSend} {look} />
            <div class="mbs-sm flex flex-col gap-sm self-stretch">
              <Button type="button" look="crash-phone-primary" onclick={send}>
                {m.crash_report_send_phone()}
              </Button>
              <Button type="button" look="crash-phone-secondary" onclick={copy}>
                {isCopied ? m.crash_report_copied() : m.crash_report_copy()}
              </Button>
            </div>
            <ReportFailures {reporting} />
          </div>
        </div>
      {:else}
        <div class="flex flex-col gap-dialog-gap">
          <div class="flex items-center gap-md">
            <span
              aria-hidden="true"
              data-prompt-badge
              class="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent block-dialog-badge inline-dialog-badge"
            >
              <Bug size={DIALOG_BADGE_ICON_SIZE} />
            </span>
            <DialogTitle
              tabindex={-1}
              data-prompt-title
              class="text-dialog-title font-bold"
            >
              {TITLES[offer.origin]()}
            </DialogTitle>
          </div>
          <AlertDialog.Description class="-mbs-xs text-dialog-body text-muted">
            {m.crash_report_body()}
          </AlertDialog.Description>
          <ReportDetails details={offer.details} />
          <AlwaysSendChoice bind:checked={alwaysSend} {look} />
          <div class="mbs-xs flex flex-wrap items-center justify-end gap-sm">
            <Button
              type="button"
              look="crash-dialog-copy"
              class="me-auto"
              onclick={copy}
            >
              {isCopied ? m.crash_report_copied() : m.crash_report_copy()}
            </Button>
            <Button
              type="button"
              look="crash-dialog-secondary"
              onclick={decline}
            >
              {m.crash_report_decline()}
            </Button>
            <Button type="button" look="crash-dialog-primary" onclick={send}>
              {m.crash_report_send()}
            </Button>
          </div>
          <ReportFailures {reporting} />
        </div>
      {/if}
    {/if}
    <span role="status" class="sr-only">
      {#if isCopied}
        {m.crash_report_copied_status()}
      {/if}
    </span>
  </DialogContent>
</AlertDialog.Root>
