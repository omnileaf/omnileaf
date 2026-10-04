<script lang="ts">
  import appIcon from "$branding/icon.svg";
  import AboutFailures from "$lib/about/AboutFailures.svelte";
  import CopyVersionButton from "$lib/about/CopyVersionButton.svelte";
  import LicencesRow from "$lib/about/LicencesRow.svelte";
  import { LinkOpening } from "$lib/about/link-opening.svelte";
  import ProjectLinkRows from "$lib/about/ProjectLinkRows.svelte";
  import { DetailsCopying } from "$lib/copying/details-copying.svelte";
  import { commands } from "$lib/ipc/bindings";
  import { WindowWidth } from "$lib/page/breakpoints";
  import { isPhone } from "$lib/page/platform";
  import { m } from "$lib/paraglide/messages.js";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const copying = new DetailsCopying(commands.copyVersionDetails);
  const opening = new LinkOpening(commands.openProjectLink);

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));
</script>

<SectionHeading title={m.about_title()} />
{#if onPhone}
  <div class="mbs-pane-gap flex flex-col gap-xl">
    <div class="flex flex-col items-center gap-sm text-center">
      <img src={appIcon} alt="" class="block-app-icon inline-app-icon" />
      <h2 class="text-app-name font-bold">{m.app_name()}</h2>
    </div>
    <div>
      <ul
        class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card"
      >
        <li
          class="flex flex-wrap items-center gap-md py-sm ps-list-row pe-sm min-block-4xl"
        >
          <span class="flex grow flex-col">
            <span class="font-semibold">{m.about_version()}</span>
            <span class="text-footnote text-muted">{data.appInfo.version}</span>
          </span>
          <CopyVersionButton {copying} look="phone" />
        </li>
        <ProjectLinkRows
          {opening}
          sourceCode={data.appInfo.sourceCode}
          look="phone"
        />
        <LicencesRow look="phone" />
      </ul>
      <AboutFailures {copying} {opening} />
    </div>
    <p class="px-md text-center text-footnote text-muted">
      {m.about_licence()}
    </p>
  </div>
{:else}
  <div
    class="mbs-pane-gap flex flex-col gap-pane-gap two-pane:max-inline-section"
  >
    <div class="flex flex-wrap items-center gap-lg">
      <img
        src={appIcon}
        alt=""
        class="block-pane-app-icon inline-pane-app-icon"
      />
      <div class="flex-1">
        <h2 class="text-group-title font-bold">{m.app_name()}</h2>
        <p class="text-label text-muted">
          {m.app_version({ version: data.appInfo.version })}
        </p>
      </div>
      <CopyVersionButton {copying} look="pane" />
    </div>
    <div>
      <ul
        class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card"
      >
        <ProjectLinkRows
          {opening}
          sourceCode={data.appInfo.sourceCode}
          look="pane"
        />
        <LicencesRow look="pane" />
      </ul>
      <AboutFailures {copying} {opening} />
    </div>
    <p class="text-footnote text-muted">{m.about_licence()}</p>
  </div>
{/if}
