<script lang="ts">
  import { onMount } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { openSettingsOrWarn } from "#lib/settings/open-settings.ts";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import { noticeWords, updateNoticesForApp } from "./update-notices.svelte.ts";

  let { isAutomatic }: { isAutomatic: boolean } = $props();

  const notices = updateNoticesForApp();
  const toasts = getNotices();

  onMount(() => {
    void notices.load();
  });

  function toggle(): void {
    void (notices.isOn ? notices.turnOff() : notices.turnOn(noticeWords()));
  }
</script>

<li>
  <SettingSwitch
    label={m.about_notify_updates()}
    description={notices.isBlocked
      ? m.about_notify_updates_blocked()
      : m.about_notify_updates_hint()}
    isOn={isAutomatic && notices.isOn}
    disabled={!isAutomatic || notices.isAsking}
    onToggle={toggle}
  />
  {#if isAutomatic && notices.isBlocked}
    <Button
      type="button"
      variant="plain"
      class="ms-sm mbe-sm"
      onclick={() => {
        void openSettingsOrWarn(
          commands.openSystemSettings,
          toasts,
          m.permissions_open_failed(),
        );
      }}>{m.permissions_open_android()}</Button
    >
  {/if}
</li>
