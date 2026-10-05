<script lang="ts">
  import ThemeChoice from "$lib/appearance/ThemeChoice.svelte";
  import { WindowWidth } from "$lib/page/breakpoints";
  import { isPhone } from "$lib/page/platform";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));
</script>

<SectionHeading title={m.appearance_title()} />
<ThemeChoice title={m.appearance_light_or_dark()} class="mbs-pane-gap">
  {#snippet hint()}
    {onPhone ? m.appearance_system_hint_phone() : m.appearance_system_hint()}
  {/snippet}
</ThemeChoice>
