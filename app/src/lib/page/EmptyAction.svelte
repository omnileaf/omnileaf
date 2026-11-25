<script lang="ts">
  import { Button, type ButtonLook } from "#lib/components/ui/button/index.ts";

  import { type ActionRank, phoneAction } from "./action-group";
  import { WindowWidth } from "./breakpoints";
  import { EMPTY_ACTION_GAP, EMPTY_MAIN_ACTION } from "./empty-action";
  import type { Glyph } from "./glyph";
  import { currentPlatform } from "./platform";

  const ICON_SIZE = 16;

  const LOOKS = {
    main: { look: "primary", fit: EMPTY_MAIN_ACTION },
    other: {
      look: "outline",
      fit: "gap-sm rounded-full px-lg font-medium min-block-touch-target desktop:text-label desktop:min-block-pointer-button",
    },
  } satisfies Record<ActionRank, { look: ButtonLook; fit: string }>;

  const HAS_PHONE_LOOK = {
    main: true,
    other: false,
  } satisfies Record<ActionRank, boolean>;

  let {
    icon: Icon,
    label,
    rank,
    onclick,
  }: {
    icon: Glyph;
    label: string;
    rank: ActionRank;
    onclick: () => void;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const phone = $derived(
    HAS_PHONE_LOOK[rank]
      ? phoneAction(platform, width.current, rank)
      : undefined,
  );
</script>

<Button
  type="button"
  {...phone === undefined
    ? { look: LOOKS[rank].look }
    : { variant: phone.variant, size: phone.size }}
  class={[
    EMPTY_ACTION_GAP,
    "flex items-center justify-center",
    phone === undefined ? LOOKS[rank].fit : phone.fit,
  ]}
  {onclick}
>
  <Icon size={ICON_SIZE} />
  {label}
</Button>
