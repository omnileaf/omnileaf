<script lang="ts">
  import type { AdultTreatment } from "#lib/ipc/bindings.ts";
  import { ADULT_TREATMENTS } from "#lib/library/adult-content.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";

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
</script>

<section aria-labelledby={headingId} class="flex flex-col gap-sm">
  <h2
    id={headingId}
    class="font-semibold touch:max-medium:text-label touch:max-medium:font-bold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted"
  >
    {m.first_launch_choices_adult()}
  </h2>
  <SegmentedControl
    options={ADULT_TREATMENTS}
    labels={LABELS}
    {chosen}
    labelledBy={headingId}
    {onChoose}
  />
</section>
