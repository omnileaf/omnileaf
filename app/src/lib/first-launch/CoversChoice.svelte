<script lang="ts">
  import { EyeOff } from "@lucide/svelte";

  import type { AdultTreatment } from "#lib/ipc/bindings.ts";
  import { ADULT_TREATMENTS } from "#lib/library/adult-content.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { CHOICE_ROW } from "./choice-row.ts";
  import { usesSetupPages } from "./setup-pages.ts";

  const ICON_SIZE = 20;

  const LABELS = {
    show: m.adult_content_show,
    blur: m.first_launch_choices_blur,
    hide: m.adult_content_hide,
  } satisfies Record<AdultTreatment, () => string>;

  let {
    chosen,
    onChoose,
  }: {
    chosen: AdultTreatment;
    onChoose: (treatment: AdultTreatment) => void;
  } = $props();

  const headingId = $props.id();
  const isSetupRow = usesSetupPages(currentPlatform());
</script>

<section
  aria-labelledby={headingId}
  class={isSetupRow ? CHOICE_ROW.section : "flex flex-col gap-sm"}
>
  {#if isSetupRow}
    <EyeOff size={ICON_SIZE} aria-hidden="true" class={CHOICE_ROW.icon} />
  {/if}
  <h2
    id={headingId}
    class={isSetupRow
      ? CHOICE_ROW.title
      : "font-semibold touch:max-medium:text-label touch:max-medium:font-bold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted"}
  >
    {m.first_launch_choices_adult()}
  </h2>
  <SegmentedControl
    options={ADULT_TREATMENTS}
    labels={LABELS}
    {chosen}
    labelledBy={headingId}
    class={isSetupRow ? CHOICE_ROW.controlAlone : ""}
    {isSetupRow}
    {onChoose}
  />
</section>
