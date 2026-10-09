<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { quickOpenShortcutLabel } from "./quick-open-shortcut";

  let {
    platform,
    class: className,
  }: { platform: Platform; class?: ClassValue } = $props();
</script>

<footer
  class={[
    "hidden items-center gap-lg border-bs border-border text-caption text-muted block-key-hints large:flex",
    className,
  ]}
>
  <span>{m.search_key_move()}</span>
  <span>{m.search_key_open()}</span>
  <span class="ms-auto">
    {m.search_key_quick_open({ shortcut: quickOpenShortcutLabel(platform) })}
  </span>
</footer>
