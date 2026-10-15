<script lang="ts">
  import { ChevronRight, FlaskConical } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import { getCrashReporting } from "#lib/crash-report/crash-reporting.svelte.ts";
  import { CrashTests } from "#lib/crash-tests/crash-tests.ts";
  import CrashTestList from "#lib/crash-tests/CrashTestList.svelte";
  import { commands } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScheduledRescansSetting } from "#lib/scheduled-rescans/scheduled-rescans.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  const NOTE_ICON_SIZE = 19;
  const CHEVRON_SIZE = 18;

  let { data }: PageProps = $props();

  const tests = new CrashTests(commands, getCrashReporting());
  const scheduledRescans = getScheduledRescansSetting();
  const isCheckingFolders = $derived(
    scheduledRescans.isOnFor(data.appInfo.platform),
  );
</script>

<SectionHeading title={m.advanced_title()} />
<div class="mbs-pane-gap flex flex-col gap-pane-gap">
  <div class="rounded-list border border-border bg-card">
    <a
      href={resolve("/(app)/settings/advanced/animations")}
      class={[
        "flex items-center gap-md rounded-list py-xs ps-lg pe-md transition-control min-block-phone-row hover:bg-hover active:bg-pressed",
        "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
        "desktop:py-none desktop:ps-list-row desktop:min-block-settings-row",
      ]}
    >
      <span class="flex-1 font-semibold desktop:text-callout">
        {m.animations_title()}
      </span>
      <ChevronRight
        size={CHEVRON_SIZE}
        aria-hidden="true"
        class="shrink-0 text-muted rtl:-scale-x-100"
      />
    </a>
  </div>
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
