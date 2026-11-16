<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { LOCK_DELAYS } from "#lib/app-lock/app-lock.ts";
  import {
    APP_LOCK_CHANGES,
    AppLockSetting,
  } from "#lib/app-lock/app-lock-setting.svelte.ts";
  import type { LockAfter } from "#lib/ipc/bindings.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingRadios from "#lib/settings/SettingRadios.svelte";
  import { CARD_SWITCH, SWITCH_CARD } from "#lib/settings/setting-row-look.ts";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const notices = getNotices();
  const android = new AndroidPhone();
  const setting = $derived(
    new AppLockSetting(data.appLock, APP_LOCK_CHANGES, {
      onFailure: (error) => {
        reportError(error);
        notices.show({
          tone: "warning",
          icon: CircleAlert,
          title: m.app_lock_change_failed(),
        });
      },
      onNoScreenLock: () => {
        notices.show({
          tone: "warning",
          icon: CircleAlert,
          title: m.app_lock_no_screen_lock(),
          body: m.app_lock_no_screen_lock_body(),
        });
      },
    }),
  );

  const lock = $derived(setting.lock);
</script>

{#snippet lockSwitch()}
  <SettingSwitch
    bleeds={android.isOn}
    class={android.isOn ? "" : CARD_SWITCH}
    label={m.app_lock_switch()}
    description={m.app_lock_switch_help()}
    isOn={lock.isOn}
    disabled={setting.isAsking}
    onToggle={() => {
      void (lock.isOn
        ? setting.turnOff()
        : setting.turnOn(m.app_lock_confirm_title()));
    }}
  />
{/snippet}

{#snippet startAppLock()}
  <SettingRadios
    title={m.app_lock_start()}
    options={LOCK_DELAYS}
    labels={{
      immediately: m.app_lock_immediately(),
      oneMinute: m.app_lock_start_one_minute(),
      fiveMinutes: m.app_lock_start_five_minutes(),
      thirtyMinutes: m.app_lock_start_thirty_minutes(),
    }}
    chosen={lock.lockAfter}
    onChoose={(lockAfter: LockAfter) => {
      void setting.chooseLockAfter(lockAfter);
    }}
  />
{/snippet}

<SectionHeading
  title={m.app_lock_title()}
  parent={{ route: "/(app)/settings/privacy", title: m.privacy_title() }}
/>
<div
  class={[
    "mbs-pane-gap flex flex-col android:max-medium:mbs-none",
    !android.isOn && "gap-xl",
  ]}
>
  {#if android.isOn}
    {@render lockSwitch()}
  {:else}
    <section class={SWITCH_CARD}>
      {@render lockSwitch()}
    </section>
  {/if}
  {#if lock.isOn}
    {@render startAppLock()}
  {/if}
</div>
