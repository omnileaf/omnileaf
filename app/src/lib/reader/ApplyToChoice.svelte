<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import type {
    ReaderSettings,
    SettingsScope,
  } from "./reader-settings.svelte.ts";
  import SettingChoice from "./SettingChoice.svelte";

  let {
    settings,
    seriesTitle,
  }: { settings: ReaderSettings; seriesTitle: string } = $props();
</script>

<SettingChoice
  isStacked
  label={m.reader_apply_to()}
  choices={[
    { value: "series", label: m.reader_this_series() },
    { value: "all", label: m.reader_all_series() },
  ]}
  chosen={settings.scope}
  onChoose={(scope: SettingsScope) => {
    settings.applyTo(scope);
  }}
>
  <p class="text-caption text-muted expanded:hidden">
    {settings.scope === "series"
      ? m.reader_applies_to_series({ series: seriesTitle })
      : m.reader_applies_to_all()}
  </p>
</SettingChoice>
