<script lang="ts">
  import { Info } from "@lucide/svelte";

  import {
    type AnimationGroup,
    getAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  const NOTE_ICON_SIZE = 16;

  let { data }: PageProps = $props();

  const animations = getAnimationsSetting();
  const onPointer = $derived(isPointer(data.appInfo.platform));
  const groups = $derived<
    readonly {
      readonly group: AnimationGroup;
      readonly label: string;
      readonly description: string;
    }[]
  >([
    {
      group: "navigation",
      label: m.animations_navigation(),
      description: onPointer
        ? m.animations_navigation_help_desktop()
        : m.animations_navigation_help(),
    },
    {
      group: "sheets",
      label: m.animations_sheets(),
      description: m.animations_sheets_help(),
    },
    {
      group: "reader",
      label: m.animations_reader(),
      description: onPointer
        ? m.animations_reader_help_desktop()
        : m.animations_reader_help(),
    },
    {
      group: "loading",
      label: m.animations_loading(),
      description: m.animations_loading_help(),
    },
  ]);
</script>

<SectionHeading
  title={m.animations_title()}
  parent={{ route: "/(app)/settings/advanced", title: m.advanced_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-lg">
  <p class="text-body text-muted desktop:text-label">{m.animations_intro()}</p>
  <div
    class="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card"
  >
    {#each groups as { group, label, description } (group)}
      <SettingSwitch
        {label}
        {description}
        isOn={animations.isOn(group)}
        onToggle={() => {
          animations.turn(group, !animations.isOn(group));
        }}
      />
    {/each}
  </div>
  <p class="flex items-start gap-sm text-footnote text-muted">
    <Info size={NOTE_ICON_SIZE} aria-hidden="true" class="mbs-2xs shrink-0" />
    {onPointer
      ? m.animations_reduce_motion_desktop()
      : m.animations_reduce_motion()}
  </p>
  <p class="text-footnote text-muted">{m.animations_page_turns()}</p>
</div>
