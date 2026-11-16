<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { LOCK_DELAY_NAMES, LOCK_DELAYS } from "#lib/app-lock/app-lock.ts";
  import {
    APP_LOCK_CHANGES,
    AppLockSetting,
  } from "#lib/app-lock/app-lock-setting.svelte.ts";
  import type { LockAfter } from "#lib/ipc/bindings.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    ANDROID_CHOICE_CARD,
    FLUSH_BLEED,
    FLUSH_FOOTER,
  } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingChoiceRow from "#lib/settings/SettingChoiceRow.svelte";
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

  const delayChoices = LOCK_DELAYS.map((delay) => ({
    value: delay,
    label: LOCK_DELAY_NAMES[delay](),
  }));
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

{#snippet lockAfterRow()}
  <SettingChoiceRow
    bleed={android.isOn ? FLUSH_BLEED : ""}
    title={m.app_lock_after()}
    value={lock.isOn
      ? LOCK_DELAY_NAMES[lock.lockAfter]()
      : m.app_lock_only_when_on()}
    help={android.isOn || !lock.isOn ? undefined : m.app_lock_after_help()}
    choices={delayChoices}
    chosen={lock.lockAfter}
    disabled={!lock.isOn}
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
    <section class="flex flex-col">
      {@render lockAfterRow()}
      {#if lock.isOn}
        <p class={FLUSH_FOOTER}>{m.app_lock_after_help()}</p>
      {/if}
    </section>
  {:else}
    <section class={SWITCH_CARD}>
      {@render lockSwitch()}
    </section>
    <section class={ANDROID_CHOICE_CARD}>
      {@render lockAfterRow()}
    </section>
  {/if}
</div>
