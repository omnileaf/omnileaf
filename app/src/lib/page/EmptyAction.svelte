<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";

  import {
    type ActionLook,
    actionLookOn,
    type ActionRank,
  } from "./action-group";
  import { WindowWidth } from "./breakpoints";
  import { EMPTY_ACTION_GAP, EMPTY_MAIN_ACTION } from "./empty-action";
  import type { Glyph } from "./glyph";
  import { currentPlatform } from "./platform";

  const ICON_SIZE = 16;

  const LOOKS = {
    main: { button: { look: "primary" }, fit: EMPTY_MAIN_ACTION },
    other: {
      button: { look: "outline" },
      fit: "gap-sm rounded-full px-lg font-medium min-block-touch-target desktop:text-label desktop:min-block-pointer-button",
    },
  } satisfies Record<ActionRank, ActionLook>;

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
  const shown = $derived(
    HAS_PHONE_LOOK[rank]
      ? actionLookOn(platform, width.current, rank, LOOKS[rank])
      : LOOKS[rank],
  );
</script>

<Button
  type="button"
  {...shown.button}
  class={[EMPTY_ACTION_GAP, "flex items-center justify-center", shown.fit]}
  {onclick}
>
  <Icon size={ICON_SIZE} />
  {label}
</Button>
