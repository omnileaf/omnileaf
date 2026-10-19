<script lang="ts">
  import {
    Bell,
    Camera,
    CircleAlert,
    ExternalLink,
    Folder,
    Settings,
    Wifi,
  } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    foldersDescription,
    foldersState,
    type PermissionState,
    systemSettingsLabel,
  } from "#lib/permissions/permissions.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  interface PermissionRow {
    readonly icon: Glyph;
    readonly label: string;
    readonly description: string;
    readonly state: PermissionState | undefined;
  }

  const ICON_SIZE = 18;
  const STATE_LABELS = {
    allowed: m.permissions_allowed,
    notAsked: m.permissions_not_asked,
  } satisfies Record<PermissionState, () => string>;
  const ROW =
    "flex flex-wrap items-center gap-md py-sm ps-lg pe-md min-block-phone-row touch:medium:ps-list-row desktop:ps-list-row desktop:min-block-settings-row";
  const TILE =
    "flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile";

  let { data }: PageProps = $props();

  const notices = getNotices();
  const settingsLabel = $derived(systemSettingsLabel(data.appInfo.platform));
  const rows: readonly PermissionRow[] = $derived([
    {
      icon: Folder,
      label: m.permissions_folders(),
      description: foldersDescription(
        data.appInfo.platform,
        data.linkedFolders,
      ),
      state: foldersState(data.linkedFolders),
    },
    {
      icon: Bell,
      label: m.permissions_notifications(),
      description: m.permissions_notifications_help(),
      state: "notAsked",
    },
    {
      icon: Wifi,
      label: m.permissions_local_network(),
      description: m.permissions_local_network_help(),
      state: "notAsked",
    },
    {
      icon: Camera,
      label: m.permissions_camera(),
      description: m.permissions_camera_help(),
      state: "notAsked",
    },
  ]);

  async function openSystemSettings(): Promise<void> {
    const opened = await commands.openSystemSettings();
    if (opened.status === "error") {
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.permissions_open_failed(),
      });
    }
  }
</script>

<SectionHeading
  title={m.permissions_title()}
  parent={{ route: "/(app)/settings/privacy", title: m.privacy_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <p class="text-detail text-muted">{m.permissions_intro()}</p>
  <ul
    aria-label={m.permissions_title()}
    class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low"
  >
    {#each rows as row (row.label)}
      <li class={ROW}>
        <span aria-hidden="true" class={TILE}>
          <row.icon size={ICON_SIZE} />
        </span>
        <span class="flex grow basis-permission-reason flex-col gap-2xs">
          <span class="font-semibold desktop:text-callout">{row.label}</span>
          <span class="text-detail text-muted">{row.description}</span>
        </span>
        {#if row.state !== undefined}
          <Badge look="outline" class="shrink-0 bg-card">
            {STATE_LABELS[row.state]()}
          </Badge>
        {/if}
      </li>
    {/each}
    {#if settingsLabel !== undefined}
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
            <span class="font-semibold desktop:text-callout">
              {settingsLabel}
            </span>
            <span class="text-detail text-muted">
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
    {/if}
  </ul>
</div>
