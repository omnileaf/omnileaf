<script lang="ts">
  import {
    Bell,
    Camera,
    ExternalLink,
    Folder,
    Settings,
    Wifi,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { PLATED_LIST } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    foldersDescription,
    foldersState,
    notificationsRow,
    type PermissionState,
    systemSettingsLabel,
  } from "#lib/permissions/permissions.ts";
  import { FLUSH_LIST, FLUSH_NOTE } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import { openSettingsOrWarn } from "#lib/settings/open-settings.ts";
  import { offersUpdateCheck } from "#lib/updates/update-check.svelte.ts";
  import { updateNoticesForApp } from "#lib/updates/update-notices.svelte.ts";

  import type { PageProps } from "./$types";

  interface PermissionRow {
    readonly icon: Glyph;
    readonly iconName: IconName;
    readonly label: string;
    readonly description: string;
    readonly state: PermissionState | undefined;
  }

  const ICON_SIZE = 18;
  const STATE_LABELS = {
    allowed: m.permissions_allowed,
    notAsked: m.permissions_not_asked,
    notAllowed: m.permissions_not_allowed,
  } satisfies Record<PermissionState, () => string>;
  const ROW =
    "flex flex-wrap items-center gap-md py-sm ps-lg pe-md min-block-phone-row touch:medium:ps-list-row desktop:ps-list-row desktop:min-block-settings-row";
  const ANDROID_ROW =
    "flex items-start gap-native-row-gap py-md ps-native-row-start pe-native-row-end min-block-native-row-two";
  const ANDROID_LABEL = "font-regular tracking-native-row-title";
  const ANDROID_LINE =
    "text-native-row-subtitle/native-row-subtitle text-muted";
  const TILE =
    "flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile android:border-0 android:bg-transparent android:text-muted";

  let { data }: PageProps = $props();

  const android = androidListLook();
  const notices = getNotices();
  const updateNotices = updateNoticesForApp();

  onMount(() => {
    if (offersUpdateCheck(data.appInfo)) {
      void updateNotices.load();
    }
  });
  const settingsLabel = $derived(systemSettingsLabel(data.appInfo.platform));
  const rows: readonly PermissionRow[] = $derived([
    {
      icon: Folder,
      iconName: "folder",
      label: m.permissions_folders(),
      description: foldersDescription(
        data.appInfo.platform,
        data.linkedFolders,
      ),
      state: foldersState(data.linkedFolders),
    },
    {
      icon: Bell,
      iconName: "bell",
      label: m.permissions_notifications(),
      ...notificationsRow(
        offersUpdateCheck(data.appInfo),
        updateNotices.access,
      ),
    },
    {
      icon: Wifi,
      iconName: "wifi",
      label: m.permissions_local_network(),
      description: m.permissions_local_network_help(),
      state: "notAsked",
    },
    {
      icon: Camera,
      iconName: "camera",
      label: m.permissions_camera(),
      description: m.permissions_camera_help(),
      state: "notAsked",
    },
  ]);

  function openSystemSettings(): Promise<void> {
    return openSettingsOrWarn(
      commands.openSystemSettings,
      notices,
      m.permissions_open_failed(),
    );
  }
</script>

{#snippet systemSettingsRow(label: string)}
  <li>
    <button
      type="button"
      class={[
        ROW,
        "text-start transition-control inline-full hover:bg-hover active:bg-pressed",
      ]}
      onclick={openSystemSettings}
    >
      <span aria-hidden="true" class={TILE}>
        <Settings size={ICON_SIZE} />
      </span>
      <span class="flex grow basis-permission-reason flex-col gap-2xs">
        <span class="font-semibold android:font-regular desktop:text-callout">
          {label}
        </span>
        <span
          class="text-detail text-muted android:text-native-row-subtitle/native-row-subtitle"
        >
          {m.permissions_open_help()}
        </span>
      </span>
      <ExternalLink
        size={ICON_SIZE}
        aria-hidden="true"
        class="shrink-0 text-muted"
      />
    </button>
  </li>
{/snippet}

<SectionHeading
  title={m.permissions_title()}
  parent={{ route: "/(app)/settings/privacy", title: m.privacy_title() }}
/>
<div
  class="mbs-pane-gap flex flex-col gap-sm android:mbs-none android:gap-none"
>
  <p class={android.isOn ? FLUSH_NOTE : "text-detail text-muted"}>
    {m.permissions_intro()}
  </p>
  <ul
    data-settings-group
    aria-label={m.permissions_title()}
    class={android.isOn ? FLUSH_LIST : ["rounded-list", PLATED_LIST]}
  >
    {#each rows as row (row.label)}
      <li class={android.isOn ? ANDROID_ROW : ROW}>
        {#if android.isOn}
          <Icon name={row.iconName} class="shrink-0" />
        {:else}
          <span aria-hidden="true" class={TILE}>
            <row.icon size={ICON_SIZE} />
          </span>
        {/if}
        <span
          class={[
            "flex grow flex-col",
            android.isOn
              ? "min-inline-none"
              : "basis-permission-reason gap-2xs",
          ]}
        >
          <span
            class={[
              "desktop:text-callout",
              android.isOn ? ANDROID_LABEL : "font-semibold",
            ]}
          >
            {row.label}
          </span>
          <span
            class={["text-muted", android.isOn ? ANDROID_LINE : "text-detail"]}
          >
            {row.description}
          </span>
        </span>
        {#if row.state !== undefined}
          {#if android.isOn}
            <span
              data-slot="state"
              class={[
                "shrink-0 text-caption font-medium tracking-native-row-title",
                row.state === "allowed" ? "text-accent" : "text-muted",
              ]}
            >
              {STATE_LABELS[row.state]()}
            </span>
          {:else}
            <Badge look="outline" class="shrink-0 bg-card">
              {STATE_LABELS[row.state]()}
            </Badge>
          {/if}
        {/if}
      </li>
    {/each}
    {#if !android.isOn && settingsLabel !== undefined}
      {@render systemSettingsRow(settingsLabel)}
    {/if}
  </ul>
  {#if android.isOn && settingsLabel !== undefined}
    <ul data-settings-group class={FLUSH_LIST}>
      {@render systemSettingsRow(settingsLabel)}
    </ul>
  {/if}
</div>
