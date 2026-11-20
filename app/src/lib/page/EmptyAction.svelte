<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";

  import { EMPTY_ACTION_GAP } from "./empty-action";
  import type { Glyph } from "./glyph";

  const ICON_SIZE = 16;

  let {
    icon: Icon,
    label,
    onclick,
  }: { icon: Glyph; label: string; onclick: () => void } = $props();
</script>

<Button
  type="button"
  look="outline"
  class="{EMPTY_ACTION_GAP} flex items-center gap-sm rounded-full px-lg font-medium min-block-touch-target desktop:text-label desktop:min-block-pointer-button"
  {onclick}
>
  <Icon size={ICON_SIZE} />
  {label}
</Button>
