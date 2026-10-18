<script lang="ts">
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { PromptLook } from "./look";

  let {
    checked = $bindable(false),
    look,
  }: { checked?: boolean; look: PromptLook } = $props();

  const LOOKS = {
    phone: "text-label",
    dialog: "text-footnote",
  } satisfies Record<PromptLook, string>;
</script>

<label
  class={[
    "flex cursor-pointer items-center gap-md text-start touch:min-block-touch-target",
    LOOKS[look],
  ]}
>
  <Checkbox
    bind:checked
    class="relative cursor-pointer before:absolute before:block-pointer-minimum before:inline-pointer-minimum"
  />
  {m.crash_report_always()}
</label>
