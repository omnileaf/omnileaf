<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { Button, type ButtonLook } from "#lib/components/ui/button/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { phoneAction } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";

  type Placement =
    | "page-heading"
    | "empty-state"
    | "card-foot"
    | "below-list"
    | "drop-area"
    | "list-row";

  const LOOKS = {
    "page-heading": "tinted",
    "empty-state": "primary",
    "card-foot": "outline",
    "below-list": "tinted",
    "drop-area": "outline",
    "list-row": "row",
  } satisfies Record<Placement, ButtonLook>;

  const PLACEMENTS = {
    "page-heading":
      "-my-sm gap-sm min-block-touch-target max-medium:rounded-full max-medium:text-accent max-medium:inline-touch-target medium:rounded-control medium:border medium:border-field medium:bg-card medium:ps-md medium:pe-lg medium:text-foreground desktop:text-label desktop:medium:-my-xs desktop:medium:min-block-pointer-button touch:max-medium:-me-sm",
    "empty-state":
      "gap-sm rounded-shadcn-button px-lg font-medium min-block-touch-target ios:max-medium:rounded-phone-button ios:max-medium:min-block-ios-control desktop:text-label desktop:min-block-pointer-button",
    "card-foot":
      "gap-sm rounded-full border-foreground px-lg transition-control inline-full block-folders-button enabled:hover:tint-hover enabled:active:tint-pressed desktop:text-label",
    "below-list":
      "gap-sm rounded-full border border-accent px-lg text-accent inline-full min-block-touch-button touch:font-bold ios:rounded-ios-button desktop:rounded-control desktop:text-label desktop:min-block-pointer-button",
    "drop-area":
      "gap-sm rounded-control border-accent px-lg text-label transition-control min-block-pointer-target enabled:hover:tint-hover enabled:active:tint-pressed windows:rounded-shadcn-button windows:border-button-outline-edge windows:bg-button-outline windows:font-medium windows:border-be-windows-stroke-strong windows:min-block-shadcn-button",
    "list-row": `${ROW_FOCUS_RING} justify-start gap-native-row-gap ps-native-row-start pe-native-row-end text-accent text-native-row-title/native-row-title font-native-row-title tracking-native-row-title min-block-native-row inline-full android:max-medium:rounded-none android:max-medium:text-foreground`,
  } satisfies Record<Placement, string>;

  const ICON_SIZE = 16;
  const LIST_ROW_ICON_SIZE = 22;

  let {
    adding,
    placement,
    element = $bindable(null),
  }: {
    adding: FolderAdding;
    placement: Placement;
    element?: HTMLElement | null;
  } = $props();

  const isInHeading = $derived(placement === "page-heading");
  const platform = currentPlatform();
  const width = new WindowWidth();
  const phone = $derived(
    placement === "empty-state"
      ? phoneAction(platform, width.current, "main")
      : undefined,
  );
</script>

<Tooltip
  bind:ref={element}
  label={isInHeading ? m.library_add_folder() : undefined}
  type="button"
  disabled={adding.isAdding}
  onclick={() => {
    void adding.add();
  }}
>
  {#snippet child({ props })}
    <Button
      {...props}
      {...phone === undefined
        ? { look: LOOKS[placement] }
        : { variant: phone.variant, size: phone.size }}
      class={[
        "inline-flex shrink-0 items-center justify-center disabled:opacity-60",
        phone === undefined
          ? [
              placement === "list-row"
                ? "android:max-medium:font-regular"
                : "font-semibold",
              PLACEMENTS[placement],
            ]
          : phone.fit,
      ]}
    >
      <Plus size={placement === "list-row" ? LIST_ROW_ICON_SIZE : ICON_SIZE} />
      <span class={{ "max-medium:sr-only": isInHeading }}
        >{m.library_add_folder()}</span
      >
    </Button>
  {/snippet}
</Tooltip>
