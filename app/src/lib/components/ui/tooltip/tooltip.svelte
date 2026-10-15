<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";

  import { LongPress } from "#lib/components/long-press.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";

  const LONG_PRESS_MS = 500;
  const TRIGGER_GAP_PX = 4;
  const SCREEN_EDGE_GAP_PX = 8;

  type ClickEvent = Parameters<
    NonNullable<TooltipPrimitive.TriggerProps["onclick"]>
  >[0];

  let {
    label,
    keys,
    ref = $bindable(null),
    onclick,
    ...restProps
  }: TooltipPrimitive.TriggerProps & {
    label: string | undefined;
    keys?: readonly string[];
  } = $props();

  const longPress = new LongPress(LONG_PRESS_MS);
  let open = $state(false);

  function press(event: PointerEvent): void {
    longPress.pointerWentDown();
    if (label === undefined) {
      return;
    }
    longPress.pressed(event, () => {
      open = true;
    });
  }

  function release(): void {
    longPress.released();
  }

  function click(event: ClickEvent): void {
    longPress.clicked(event);
    if (!event.defaultPrevented) {
      onclick?.(event);
    }
  }

  $effect(() => release);
</script>

<TooltipPrimitive.Provider ignoreNonKeyboardFocus>
  <TooltipPrimitive.Root bind:open disabled={label === undefined}>
    <TooltipPrimitive.Trigger
      bind:ref
      {...restProps}
      onpointerdown={press}
      onpointerup={release}
      onpointercancel={release}
      onpointerleave={release}
      onclick={click}
    />
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        aria-hidden="true"
        sideOffset={TRIGGER_GAP_PX}
        collisionPadding={SCREEN_EDGE_GAP_PX}
        class="z-tooltip flex items-center gap-sm rounded-tooltip border border-tooltip-edge bg-tooltip px-md py-xs text-detail font-medium text-on-tooltip fade-motion shadow-popover"
      >
        <span>{label}</span>
        {#each keys ?? [] as key (key)}
          <Kbd>{key}</Kbd>
        {/each}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
</TooltipPrimitive.Provider>
