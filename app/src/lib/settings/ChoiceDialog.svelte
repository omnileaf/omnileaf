<script lang="ts" module>
  export interface Choice<Option extends string> {
    readonly value: Option;
    readonly label: string;
    readonly lang?: string | undefined;
    readonly hint?: string | undefined;
  }
</script>

<script lang="ts" generics="Value extends string">
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { radiosLook } from "./radios-look";

  let {
    isOpen,
    title,
    choices,
    chosen,
    onChoose,
    onClose,
  }: {
    isOpen: boolean;
    title: string;
    choices: readonly Choice<Value>[];
    chosen: Value;
    onChoose: (value: Value) => void;
    onClose: () => void;
  } = $props();

  const DIALOG =
    "inset-none m-auto flex flex-col overflow-hidden rounded-native-dialog border-none bg-dialog p-xl text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit";
  const look = radiosLook(true);
  const id = $props.id();
</script>

<Dialog.Root
  bind:open={
    () => isOpen,
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    }
  }
>
  <ModalContent
    wideClass={DIALOG}
    phoneLook="dialog"
    phoneClass={DIALOG}
    phoneOverlayClass="bg-native-scrim"
    wideOverlayClass="bg-native-scrim"
    onDismiss={onClose}
  >
    <DialogTitle
      class="pbe-lg text-native-large-title/native-large-title font-native-large-title tracking-native-large-title"
    >
      {title}
    </DialogTitle>
    <RadioGroup
      options={choices.map(({ value }) => value)}
      {chosen}
      onChoose={(value: Value) => {
        onChoose(value);
        onClose();
      }}
      aria-label={title}
      class="-mx-xl flex flex-col overflow-y-auto"
    >
      {#each choices as choice (choice.value)}
        {@const isChosen = chosen === choice.value}
        <RadioGroupItem
          value={choice.value}
          aria-labelledby="{id}-{choice.value}-label"
          class={look.row}
        >
          <span
            aria-hidden="true"
            data-radio-mark
            class={[look.mark, isChosen ? look.markOn : look.markOff]}
          >
            {#if isChosen}
              <span
                class="rounded-full bg-accent block-radio-dot inline-radio-dot"
              ></span>
            {/if}
          </span>
          <span class={look.words}>
            <span
              id="{id}-{choice.value}-label"
              lang={choice.lang}
              class={look.label}>{choice.label}</span
            >
            {#if choice.hint !== undefined}
              <span class={look.hint}>{choice.hint}</span>
            {/if}
          </span>
        </RadioGroupItem>
      {/each}
    </RadioGroup>
    <div class="mbs-lg flex justify-end gap-sm">
      <Button
        type="button"
        look="confirm-cancel"
        class="bg-transparent px-md text-native-on-button-plain shadow-none hover:bg-native-button-plain-hover active:bg-native-button-plain-pressed"
        onclick={onClose}
      >
        {m.library_cancel()}
      </Button>
    </div>
  </ModalContent>
</Dialog.Root>
