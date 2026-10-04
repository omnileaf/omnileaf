<script lang="ts">
  import type { PromptLook } from "./look";

  let { details, look }: { details: string; look: PromptLook } = $props();

  const LOOKS = {
    phone: "rounded-card",
    dialog: "rounded-tile",
  } satisfies Record<PromptLook, string>;
</script>

<pre
  class={[
    "self-stretch bg-chip px-list-row py-md font-mono text-code wrap-anywhere whitespace-pre-wrap",
    LOOKS[look],
  ]}>{details}</pre>
