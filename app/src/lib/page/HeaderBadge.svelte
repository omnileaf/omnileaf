<script lang="ts">
  import { Badge, type BadgeLook } from "#lib/components/ui/badge/index.ts";

  import type { Glyph } from "./glyph";

  const ICON_SIZE = 18;

  let {
    icon: Icon,
    look,
  }: { icon: Glyph; look: Extract<BadgeLook, `header-${string}`> } = $props();
</script>

<Badge {look} aria-hidden="true">
  <Icon size={ICON_SIZE} />
</Badge>
