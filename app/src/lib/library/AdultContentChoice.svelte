<script lang="ts">
  import type { AdultTreatment } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingRadios from "#lib/settings/SettingRadios.svelte";

  import { ADULT_TREATMENTS } from "./adult-content";

  let {
    chosen,
    onPointer,
    onChoose,
  }: {
    chosen: AdultTreatment;
    onPointer: boolean;
    onChoose: (treatment: AdultTreatment) => void;
  } = $props();

  const labels = $derived({
    show: m.adult_content_show(),
    blur: m.adult_content_blur(),
    hide: m.adult_content_hide(),
  } satisfies Record<AdultTreatment, string>);

  const hints = $derived({
    show: m.adult_content_show_help(),
    blur: onPointer
      ? m.adult_content_blur_help_desktop()
      : m.adult_content_blur_help(),
    hide: m.adult_content_hide_help(),
  } satisfies Record<AdultTreatment, string>);
</script>

<SettingRadios
  title={m.adult_content_title()}
  options={ADULT_TREATMENTS}
  {labels}
  {hints}
  {chosen}
  {onChoose}
/>
