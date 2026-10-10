<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import type { Glyph } from "./glyph";

  const ICON_SIZE = 18;

  let { icon: Icon, tone }: { icon: Glyph; tone: ClassValue } = $props();
</script>

<span
  aria-hidden="true"
  class={[
    "flex shrink-0 items-center justify-center rounded-full block-header-badge inline-header-badge",
    tone,
  ]}
>
  <Icon size={ICON_SIZE} />
</span>
