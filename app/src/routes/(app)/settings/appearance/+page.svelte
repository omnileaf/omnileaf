<script lang="ts">
  import AndroidColoursChoice from "#lib/appearance/AndroidColoursChoice.svelte";
  import ThemeChoice from "#lib/appearance/ThemeChoice.svelte";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import WindowsAccentChoice from "#lib/appearance/WindowsAccentChoice.svelte";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone } from "#lib/page/platform.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));
  const theme = getThemeSetting();
</script>

<SectionHeading title={m.appearance_title()} />
{#snippet systemHint()}
  {onPhone ? m.appearance_system_hint_phone() : m.appearance_system_hint()}
{/snippet}

<ThemeChoice
  title={m.appearance_light_or_dark()}
  hint={theme.preference === "system" ? systemHint : undefined}
  class="mbs-pane-gap android:mbs-none"
/>
{#if data.appInfo.platform === "windows"}
  <WindowsAccentChoice class="mbs-pane-gap" />
{/if}
{#if data.appInfo.platform === "android"}
  <AndroidColoursChoice class="mbs-pane-gap android:mbs-none" />
{/if}
