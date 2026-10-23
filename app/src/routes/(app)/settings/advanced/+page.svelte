<script lang="ts">
  import { FlaskConical, MoveVertical } from "@lucide/svelte";

  import {
    ANIMATION_GROUPS,
    getAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import { getCrashReporting } from "#lib/crash-report/crash-reporting.svelte.ts";
  import { CrashTests } from "#lib/crash-tests/crash-tests.ts";
  import CrashTestList from "#lib/crash-tests/CrashTestList.svelte";
  import { commands } from "#lib/ipc/bindings.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScheduledRescansSetting } from "#lib/scheduled-rescans/scheduled-rescans.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSelect from "#lib/settings/SettingSelect.svelte";
  import SettingsEntries from "#lib/settings/SettingsEntries.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";
  import {
    getUndoSetting,
    UNDO_WINDOWS_SECONDS,
  } from "#lib/notices/undo-setting.svelte.ts";

  import type { PageProps } from "./$types";

  const NOTE_ICON_SIZE = 19;

  let { data }: PageProps = $props();

  const tests = new CrashTests(commands, getCrashReporting());
  const scheduledRescans = getScheduledRescansSetting();
  const undo = getUndoSetting();
  const animations = getAnimationsSetting();
  const animationsOn = $derived(
    ANIMATION_GROUPS.filter((group) => animations.isOn(group)).length,
  );
  const animationsSummary = $derived.by(() => {
    if (animationsOn === ANIMATION_GROUPS.length) {
      return m.animations_summary_all_on();
    }
    return animationsOn === 0
      ? m.animations_summary_all_off()
      : m.animations_summary_some({
          on: animationsOn,
          total: ANIMATION_GROUPS.length,
        });
  });
  const undoHeadingId = $props.id();
  const isCheckingFolders = $derived(
    scheduledRescans.isOnFor(data.appInfo.platform),
  );
</script>

<SectionHeading title={m.advanced_title()} />
<div class="mbs-pane-gap flex flex-col gap-pane-gap">
  <SettingsEntries
    entries={[
      {
        route: "/(app)/settings/advanced/animations",
        icon: MoveVertical,
        label: m.animations_title(),
        summary: animationsSummary,
      },
    ]}
  />
  <section
    aria-labelledby={undoHeadingId}
    class={[
      "flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card",
      GROUP_PLATE,
    ]}
  >
    <h2 id={undoHeadingId} class="px-lg pbs-md pbe-xs text-small font-semibold">
      {m.advanced_undo()}
    </h2>
    <SettingSwitch
      label={m.advanced_offer_undo()}
      description={m.advanced_offer_undo_help()}
      isOn={undo.rules.isOffered}
      onToggle={() => {
        undo.choose({ isOffered: !undo.rules.isOffered });
      }}
    />
    <SettingSelect
      label={m.advanced_keep_undo()}
      options={UNDO_WINDOWS_SECONDS.map((seconds) => ({
        value: String(seconds),
        label: m.advanced_undo_seconds({ count: seconds }),
      }))}
      value={String(undo.rules.windowSeconds)}
      onChoose={(value) => {
        const chosen = UNDO_WINDOWS_SECONDS.find(
          (seconds) => String(seconds) === value,
        );
        if (chosen !== undefined) {
          undo.choose({ windowSeconds: chosen });
        }
      }}
    />
    <SettingSwitch
      label={m.advanced_hold_undo()}
      isOn={undo.rules.holdsWhileHoveredOrFocused}
      onToggle={() => {
        undo.choose({
          holdsWhileHoveredOrFocused: !undo.rules.holdsWhileHoveredOrFocused,
        });
      }}
    />
  </section>
  <SettingSwitch
    label={m.advanced_scheduled_rescans()}
    description={m.advanced_scheduled_rescans_help()}
    isOn={isCheckingFolders}
    onToggle={() => {
      scheduledRescans.turn(!isCheckingFolders);
    }}
    class="rounded-card border border-border bg-card"
  />
  {#if data.appInfo.isDevelopmentBuild}
    <div
      role="note"
      class="flex items-start gap-md rounded-card border border-border bg-card py-md ps-md pe-list-row touch:max-medium:ps-list-row"
    >
      <span
        aria-hidden="true"
        class="flex shrink-0 items-center justify-center rounded-tile bg-accent-soft block-tile inline-tile"
      >
        <FlaskConical size={NOTE_ICON_SIZE} />
      </span>
      <span class="flex flex-1 flex-col gap-2xs self-center min-inline-none">
        <span class="text-label font-bold touch:max-medium:text-callout"
          >{m.advanced_note_title()}</span
        >
        <span class="text-detail opacity-85">{m.advanced_note_body()}</span>
      </span>
    </div>
    <CrashTestList {tests} version={data.appInfo.version} />
  {/if}
</div>
