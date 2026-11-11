<script lang="ts" generics="Value extends string">
  import { Check } from "@lucide/svelte";
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ClassValue } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import { menuLook } from "#lib/components/ui/menu-look.ts";
  import { closesOnBack } from "#lib/navigation/overlay-back.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import type { SelectChoice, SelectName } from "./select-choice.ts";

  const CHECK_SIZE = 20;
  const ANCHOR_GAP_PX = 4;
  const SCREEN_EDGE_GAP_PX = 8;

  let {
    choices,
    class: className,
    ...name
  }: SelectName & {
    choices: readonly SelectChoice<Value>[];
    class?: ClassValue;
  } = $props();

  const look = menuLook(currentPlatform());
</script>

<SelectPrimitive.Portal disabled>
  <SelectPrimitive.Content
    {@attach closesOnBack}
    {...name}
    sideOffset={ANCHOR_GAP_PX}
    collisionPadding={SCREEN_EDGE_GAP_PX}
    class={cn(
      "z-dialog flex flex-col rounded-menu border border-menu-edge bg-menu p-menu-pad text-foreground fade-motion shadow-menu backdrop-blur-menu duration-flyout ease-flyout outline-none max-block-(--bits-select-content-available-height)",
      look.surface,
      className,
    )}
  >
    <SelectPrimitive.Viewport class="flex flex-col">
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
