<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { LOCK_DELAY_NAMES, LOCK_DELAYS } from "#lib/app-lock/app-lock.ts";
  import {
    type AppLock,
    type AppLockTurning,
    commands,
    type IpcError,
    type LockAfter,
  } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingChoiceRow from "#lib/settings/SettingChoiceRow.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  type Changed<T> =
    | { readonly status: "ok"; readonly data: T }
    | { readonly status: "error"; readonly error: IpcError };

  let { data }: PageProps = $props();

  const notices = getNotices();

  let lock: AppLock = $derived(data.appLock);
  let isAsking = $state(false);

  const delayChoices = LOCK_DELAYS.map((delay) => ({
    value: delay,
    label: LOCK_DELAY_NAMES[delay](),
  }));

  function sayIfNotChanged<T>(
    changed: Changed<T>,
  ): changed is { readonly status: "ok"; readonly data: T } {
    if (changed.status === "error") {
      reportError(changed.error);
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.app_lock_not_saved(),
      });
      return false;
    }
    return true;
  }

  function sayWhyNotOn(turning: AppLockTurning): void {
    if (turning === "noScreenLock") {
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.app_lock_no_screen_lock(),
        body: m.app_lock_no_screen_lock_body(),
      });
    }
  }

  async function turnOn(): Promise<void> {
    isAsking = true;
    const turned = await commands.turnAppLockOn(m.app_lock_confirm_title());
    isAsking = false;
    if (!sayIfNotChanged(turned)) {
      return;
    }
    if (turned.data === "turnedOn") {
      lock = { ...lock, isOn: true };
    } else {
      sayWhyNotOn(turned.data);
    }
  }

  async function turnOff(): Promise<void> {
    if (sayIfNotChanged(await commands.turnAppLockOff())) {
      lock = { ...lock, isOn: false };
    }
  }

  async function chooseLockAfter(lockAfter: LockAfter): Promise<void> {
    if (sayIfNotChanged(await commands.chooseLockAfter(lockAfter))) {
      lock = { ...lock, lockAfter };
    }
  }

  async function hideContentInRecents(isHidden: boolean): Promise<void> {
    if (sayIfNotChanged(await commands.hideContentInRecents(isHidden))) {
      lock = { ...lock, hidesContentInRecents: isHidden };
    }
  }
</script>

<SectionHeading
  title={m.app_lock_title()}
  parent={{ route: "/(app)/settings/privacy", title: m.privacy_title() }}
/>
<div class="flex flex-col">
  <SettingSwitch
    bleeds
    label={m.app_lock_switch()}
    description={m.app_lock_switch_help()}
    isOn={lock.isOn}
    disabled={isAsking}
    onToggle={() => (lock.isOn ? turnOff() : turnOn())}
  />
  <SettingChoiceRow
    title={m.app_lock_after()}
    value={LOCK_DELAY_NAMES[lock.lockAfter]()}
    help={lock.isOn ? m.app_lock_after_help() : m.app_lock_only_when_on()}
    choices={delayChoices}
    chosen={lock.lockAfter}
    disabled={!lock.isOn}
    onChoose={chooseLockAfter}
  />
  {#if lock.canHideContentInRecents}
    <SettingSwitch
      bleeds
      label={m.app_lock_hide_content()}
      description={lock.isOn
        ? m.app_lock_hide_content_help()
        : m.app_lock_only_when_on()}
      isOn={lock.hidesContentInRecents}
      disabled={!lock.isOn}
      onToggle={() => hideContentInRecents(!lock.hidesContentInRecents)}
    />
  {/if}
</div>
