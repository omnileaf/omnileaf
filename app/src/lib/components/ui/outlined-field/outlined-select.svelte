<script lang="ts" generics="Value extends string">
  import { Check, ChevronDown } from "@lucide/svelte";
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ClassValue, HTMLButtonAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import { menuLook } from "#lib/components/ui/menu-look.ts";
  import { closesOnBack } from "#lib/navigation/overlay-back.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { OUTLINED_FIELD_LABEL } from "./looks.ts";

  const CHEVRON_SIZE = 24;
  const CHECK_SIZE = 20;
  const FIELD_GAP_PX = 4;
  const SCREEN_EDGE_GAP_PX = 8;

  interface Choice {
    readonly value: Value;
    readonly label: string;
  }

  let {
    label,
    labelClass = "bg-background",
    class: className,
    choices,
    value,
    onChoose,
    ...triggerProps
  }: Omit<
    HTMLButtonAttributes,
    "id" | "class" | "children" | "value" | "type"
  > & {
    label: string;
    labelClass?: ClassValue;
    class?: ClassValue;
    choices: readonly Choice[];
    value: Value;
    onChoose: (value: Value) => void;
  } = $props();

  const id = $props.id();
  const labelId = `${id}-label`;
  const look = menuLook(currentPlatform());
  const chosenLabel = $derived(
    choices.find((choice) => choice.value === value)?.label ?? "",
  );

  function choose(picked: string): void {
    const choice = choices.find((candidate) => candidate.value === picked);
    if (choice !== undefined) {
      onChoose(choice.value);
    }
  }
</script>

<div
  data-slot="outlined-select"
  class={cn("relative min-inline-none", className)}
>
  <label
    id={labelId}
    for={id}
    class={cn(OUTLINED_FIELD_LABEL, "pointer-events-none", labelClass)}
  >
    {label}
  </label>
  <SelectPrimitive.Root
    type="single"
    {value}
    onValueChange={choose}
    items={[...choices]}
  >
    <SelectPrimitive.Trigger
      {id}
      class="flex items-center rounded-native-outlined-field border border-native-button-outline-edge bg-transparent ps-lg pe-select-end text-start text-body outline-none block-native-outlined-field inline-full focus-visible:border-accent aria-expanded:border-accent"
      {...triggerProps}
    >
      <span class="truncate">{chosenLabel}</span>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal disabled>
      <SelectPrimitive.Content
        {@attach closesOnBack}
        aria-labelledby={labelId}
        sideOffset={FIELD_GAP_PX}
        collisionPadding={SCREEN_EDGE_GAP_PX}
        class={cn(
          "z-dialog flex flex-col rounded-menu border border-menu-edge bg-menu p-menu-pad text-foreground fade-motion shadow-menu backdrop-blur-menu duration-flyout ease-flyout outline-none inline-(--bits-select-anchor-width) max-block-(--bits-select-content-available-height)",
          look.surface,
        )}
      >
        <SelectPrimitive.Viewport class="flex flex-col overflow-y-auto">
          {#each choices as choice (choice.value)}
            <SelectPrimitive.Item value={choice.value} label={choice.label}>
              {#snippet child({ props, selected })}
                <div
                  {...props}
                  data-state={selected ? "checked" : "unchecked"}
                  class={cn(
                    "flex cursor-default items-center gap-sm rounded-menu-item px-menu-item-inline text-label outline-none select-none min-block-menu-item data-highlighted:bg-menu-highlight data-highlighted:text-on-menu-highlight",
                    look.item,
                    look.chosenItem,
                  )}
                >
                  <span class="flex-1 truncate">{choice.label}</span>
                  <Check
                    size={CHECK_SIZE}
                    aria-hidden="true"
                    class={[
                      "shrink-0",
                      look.check,
                      !selected && ["invisible", look.uncheckedCheck],
                    ]}
                  />
                </div>
              {/snippet}
            </SelectPrimitive.Item>
          {/each}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
  <ChevronDown
    size={CHEVRON_SIZE}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-md inset-bs-1/2 -translate-y-1/2 text-muted"
  />
</div>
