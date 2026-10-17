<script lang="ts">
  import { CircleAlert, Send } from "@lucide/svelte";

  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ReportSharing } from "./report-sharing.svelte";
  import { failureMessage } from "./share-failure";

  const ICON_SIZE = 16;

  let { sharing }: { sharing: ReportSharing } = $props();

  const fieldId = $props.id();
  const hintId = `${fieldId}-hint`;
  const noteId = `${fieldId}-note`;

  const failure = $derived(
    sharing.failure?.way === "send" ? sharing.failure : undefined,
  );
</script>

<div class="mbs-lg mbe-xs flex flex-col">
  <div
    class="flex flex-col gap-sm rounded-card border border-border bg-card px-lg py-field-card-block android:rounded-android-md android:border-transparent android:bg-android-container-low"
  >
    <label for={fieldId} class="text-label font-medium">
      {m.report_reply_email()}
    </label>
    <Input
      id={fieldId}
      type="email"
      autocomplete="email"
      placeholder={m.report_reply_email_placeholder()}
      aria-describedby={hintId}
      value={sharing.replyTo}
      oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
        sharing.replyTo = event.currentTarget.value;
      }}
      class="flex-none rounded-shadcn-control border border-field bg-input-fill px-md text-label shadow-raised block-pointer-button touch:text-body touch:block-touch-target"
    />
    <p id={hintId} class="text-small text-muted">
      {m.report_reply_email_hint()}
    </p>
  </div>
  <div class="mbs-xl flex flex-col gap-sm">
    <Button
      type="button"
      look="primary"
      aria-describedby={noteId}
      class="flex items-center justify-center gap-sm rounded-shadcn-button px-lg text-body font-medium min-block-shadcn-button expanded:self-start ios:rounded-ios-button ios:font-semibold ios:min-block-ios-control macos:shadow-raised linux:shadow-raised desktop:px-md desktop:text-label"
      onClickPromise={() => sharing.share("send")}
    >
      <Send size={ICON_SIZE} aria-hidden="true" />
      {m.report_send()}
    </Button>
    <p id={noteId} class="mbs-md text-small text-muted">
      {m.report_send_note()}
    </p>
  </div>
  <div role="alert">
    {#if failure !== undefined}
      <Alert tone="warning" icon={CircleAlert} class="mbs-md">
        <AlertTitle>{failureMessage(failure)}</AlertTitle>
      </Alert>
    {/if}
  </div>
</div>
