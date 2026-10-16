<script lang="ts">
  import { CircleAlert, Keyboard } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DialogContent,
    DialogTitle,
  } from "#lib/components/ui/dialog/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { usesCommandKey } from "#lib/page/platform.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import {
    DEFAULT_SCREENSHOT_SHORTCUT,
    type KeyCombination,
    keyNames,
  } from "./key-combination";
  import { recordPress, takenUse, type TakenUse } from "./key-recording";

  type Refusal =
    | { readonly kind: "unusable" }
    | { readonly kind: "taken"; readonly use: TakenUse };

  const ERROR_ICON_SIZE = 16;

  const TAKEN_MESSAGES = {
    quickOpen: m.screenshot_mode_shortcut_taken_quick_open,
    search: m.screenshot_mode_shortcut_taken_search,
    undo: m.screenshot_mode_shortcut_taken_undo,
    selectAll: m.screenshot_mode_shortcut_taken_select_all,
    sidebar: m.screenshot_mode_shortcut_taken_sidebar,
    editing: m.screenshot_mode_shortcut_taken_editing,
    macos: m.screenshot_mode_shortcut_taken_macos,
  } satisfies Record<TakenUse, (inputs: { keys: string }) => string>;

  let {
    platform,
    current,
    onSave,
    onClose,
  }: {
    readonly platform: Platform;
    readonly current: KeyCombination;
    readonly onSave: (combination: KeyCombination) => void;
    readonly onClose: () => void;
  } = $props();

  const fieldId = $props.id();
  const refusalId = `${fieldId}-refusal`;

  let field: HTMLElement | null = $state(null);
  let shown: KeyCombination | undefined = $state.raw();
  let refusal: Refusal | undefined = $state.raw();

  const isChanged = $derived(
    shown !== undefined &&
      (shown.letter !== current.letter || shown.shift !== current.shift),
  );
  const canSave = $derived(isChanged && refusal === undefined);

  function refusalMessage(refused: Refusal): string {
    if (refused.kind === "unusable") {
      return m.screenshot_mode_shortcut_unusable({
        command: usesCommandKey(platform)
          ? m.shortcut_key_command()
          : m.shortcut_key_control(),
      });
    }
    const keys = shown === undefined ? "" : keyNames(shown, platform).join(" ");
    return TAKEN_MESSAGES[refused.use]({ keys });
  }

  function show(combination: KeyCombination): void {
    shown = combination;
    const use = takenUse(combination, platform);
    refusal = use === undefined ? undefined : { kind: "taken", use };
  }

  function record(event: KeyboardEvent): void {
    const press = recordPress(event, platform);
    if (press.kind === "passedOn") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (press.kind === "unusable") {
      shown = undefined;
      refusal = { kind: "unusable" };
      return;
    }
    show(press.combination);
  }

  function save(): void {
    if (shown !== undefined && canSave) {
      onSave(shown);
    }
    onClose();
  }
</script>

<Dialog.Root
  open
  onOpenChange={(open: boolean) => {
    if (!open) {
      onClose();
    }
  }}
>
  <DialogContent
    class="inset-none m-auto flex flex-col gap-lg rounded-panel border border-dialog-edge bg-card p-lg text-foreground fade-motion shadow-dialog block-fit inline-dialog max-inline-dialog-limit"
    onOpenAutoFocus={(event: Event) => {
      event.preventDefault();
      field?.focus();
    }}
  >
    <div class="flex flex-col gap-xs">
      <div class="flex items-center gap-md">
        <HeaderBadge icon={Keyboard} look="header-accent" />
        <DialogTitle class="text-title font-bold">
          {m.screenshot_mode_shortcut_dialog_title()}
        </DialogTitle>
      </div>
      <Dialog.Description class="text-detail text-muted">
        {m.screenshot_mode_shortcut_dialog_description()}
      </Dialog.Description>
    </div>
    <div class="flex flex-col gap-sm">
      <div
        bind:this={field}
        role="textbox"
        tabindex="0"
        aria-label={m.screenshot_mode_shortcut_dialog_field()}
        aria-invalid={refusal !== undefined}
        aria-describedby={refusal === undefined ? undefined : refusalId}
        class={[
          "flex items-center justify-center gap-2xs rounded-control border-2 bg-background px-md block-shortcut-field focus-visible:outline-2 focus-visible:outline-offset-2",
          refusal === undefined
            ? "border-foreground focus-visible:outline-accent"
            : "border-danger focus-visible:outline-danger",
        ]}
        onkeydown={record}
      >
        {#if shown !== undefined}
          {#each keyNames(shown, platform) as name (name)}
            <Kbd class="px-sm py-2xs whitespace-nowrap">{name}</Kbd>
          {/each}
        {/if}
      </div>
      {#if refusal !== undefined}
        <p
          id={refusalId}
          role="alert"
          class="flex items-start gap-xs text-detail text-danger"
        >
          <CircleAlert
            size={ERROR_ICON_SIZE}
            aria-hidden="true"
            class="mbs-2xs shrink-0"
          />
          {refusalMessage(refusal)}
        </p>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-sm">
      <Button
        type="button"
        look="tinted"
        class="me-auto rounded-control px-md text-small font-semibold min-block-pointer-button"
        onclick={() => {
          show(DEFAULT_SCREENSHOT_SHORTCUT);
        }}
      >
        {m.screenshot_mode_shortcut_dialog_default()}
      </Button>
      <Button
        type="button"
        look="outline"
        class="px-lg text-small min-block-pointer-button"
        onclick={onClose}
      >
        {m.screenshot_mode_shortcut_dialog_cancel()}
      </Button>
      <Button
        type="button"
        look="primary"
        class="rounded-control px-lg text-small font-semibold min-block-pointer-button disabled:opacity-50"
        disabled={!canSave}
        onclick={save}
      >
        {m.screenshot_mode_shortcut_dialog_save()}
      </Button>
    </div>
  </DialogContent>
</Dialog.Root>
