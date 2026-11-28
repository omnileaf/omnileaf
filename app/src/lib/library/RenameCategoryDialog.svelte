<script lang="ts">
  import { CircleAlert, Pencil } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    ACCENT_CONFIRM_FILL,
    alertLook,
    CONTENT_DIALOG_PANEL,
  } from "#lib/components/ui/dialog/alert-look.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import {
    OUTLINED_FIELD_CONTROL,
    OutlinedField,
  } from "#lib/components/ui/outlined-field/index.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { currentPlatform, isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type CategoryNameProblem,
    categoryNameProblem,
    type RefusedName,
  } from "./category-name.ts";

  const REASON_ICON_SIZE = 16;
  const CONFIRM_LOOK =
    "aria-disabled:opacity-60 ios:max-medium:bg-native-button-primary ios:max-medium:text-native-on-button-primary ios:max-medium:hover:bg-native-button-primary ios:max-medium:active:bg-native-button-primary android:max-medium:aria-disabled:text-native-on-control-disabled android:max-medium:aria-disabled:opacity-100";
  const FIELD =
    "flex-none rounded-shadcn-control border border-field bg-input-fill px-md text-label shadow-raised block-pointer-button touch:text-body touch:block-touch-target ios:max-medium:rounded-full ios:max-medium:border-0 ios:max-medium:bg-native-search-view ios:max-medium:px-lg ios:max-medium:shadow-none ios:max-medium:block-native-button-large aria-invalid:border-danger";

  let {
    name,
    otherNames,
    refused,
    isBusy = false,
    onRename,
    onClose,
  }: {
    name: string | undefined;
    otherNames: readonly string[];
    refused?: RefusedName | undefined;
    isBusy?: boolean;
    onRename: (to: string) => void;
    onClose: () => void;
  } = $props();

  const platform = currentPlatform();
  const look = alertLook(platform);
  const isOutlined = platform === "android";
  const showsReasonIcon = isPointer(platform);
  const fieldId = $props.id();
  const reasonId = `${fieldId}-reason`;

  const shown = lastShown(() => name);
  let typed = $derived(name ?? shown.current ?? "");
  const problem = $derived(problemOf(typed));
  const reason = $derived.by(() => {
    switch (problem) {
      case "empty":
        return m.library_tabs_name_empty();
      case "taken":
        return m.library_tabs_name_taken({ name: typed.trim() });
      case undefined:
        return undefined;
    }
  });

  function problemOf(to: string): CategoryNameProblem | undefined {
    if (name === undefined) {
      return undefined;
    }
    return refused?.name === to.trim()
      ? refused.problem
      : categoryNameProblem(to, otherNames);
  }

  function rename(): void {
    if (name === undefined || problem !== undefined || isBusy) {
      return;
    }
    const to = typed.trim();
    if (to === name) {
      onClose();
      return;
    }
    onRename(to);
  }

  function typeName(event: Event & { currentTarget: HTMLInputElement }): void {
    typed = event.currentTarget.value;
  }

  function renameOnEnter(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      rename();
    }
  }
</script>

<Dialog.Root
  bind:open={
    () => name !== undefined,
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    }
  }
>
  <ModalContent
    wideClass={cn(CONTENT_DIALOG_PANEL, look.surface)}
    phoneLook="dialog"
    phoneClass={cn(CONTENT_DIALOG_PANEL, look.surface)}
    phoneOverlayClass={look.scrim}
    wideOverlayClass={look.scrim}
    onDismiss={onClose}
  >
    <div class={cn("flex items-center gap-md", look.header)}>
      {#if !look.showsAppIcon}
        <HeaderBadge icon={Pencil} look="header-accent" class={look.badge} />
      {/if}
      <DialogTitle
        class={cn(
          "text-dialog-title font-bold max-medium:text-sheet-title",
          look.title,
        )}
      >
        {m.library_tabs_rename_title()}
      </DialogTitle>
    </div>
    <div
      class={cn("-m-sm flex flex-col gap-lg p-sm min-block-none", look.body)}
    >
      <div class="flex flex-col gap-sm">
        {#if isOutlined}
          <OutlinedField
            label={m.library_tabs_category_name()}
            labelFor={fieldId}
            labelClass="bg-dialog"
            isInvalid={problem !== undefined}
          >
            <Input
              id={fieldId}
              value={typed}
              aria-invalid={problem !== undefined}
              aria-describedby={reason === undefined ? undefined : reasonId}
              oninput={typeName}
              onkeydown={renameOnEnter}
              class={OUTLINED_FIELD_CONTROL}
            />
          </OutlinedField>
        {:else}
          <label
            for={fieldId}
            class="text-detail font-medium ios:max-medium:sr-only"
          >
            {m.library_tabs_category_name()}
          </label>
          <Input
            id={fieldId}
            value={typed}
            aria-invalid={problem !== undefined}
            aria-describedby={reason === undefined ? undefined : reasonId}
            oninput={typeName}
            onkeydown={renameOnEnter}
            class={FIELD}
          />
        {/if}
        <p
          id={reasonId}
          aria-live="polite"
          class="flex items-center gap-xs text-footnote text-danger empty:hidden"
        >
          {#if reason !== undefined}
            {#if showsReasonIcon}
              <CircleAlert size={REASON_ICON_SIZE} aria-hidden="true" />
            {/if}
            <span>{reason}</span>
          {/if}
        </p>
      </div>
      <div class={cn("mbs-xs grid grid-cols-2 gap-sm", look.actions)}>
        {#each look.actionOrder as action (action)}
          {#if action === "cancel"}
            <Button
              type="button"
              {...look.buttons.cancel}
              class={look.cancel}
              onclick={onClose}
            >
              {m.library_cancel()}
            </Button>
          {:else}
            <Button
              type="button"
              {...look.buttons.confirm}
              class={cn(ACCENT_CONFIRM_FILL, look.confirm, CONFIRM_LOOK)}
              aria-disabled={problem !== undefined || isBusy || undefined}
              onclick={rename}
            >
              {m.library_tabs_rename()}
            </Button>
          {/if}
        {/each}
      </div>
    </div>
  </ModalContent>
</Dialog.Root>
