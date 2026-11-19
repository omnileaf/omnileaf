<script lang="ts">
  import { resolve } from "$app/paths";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import type { SettingsPage } from "#lib/settings/sections.ts";

  import AboutLinkRow from "./AboutLinkRow.svelte";
  import type { AboutLook } from "./look";

  let {
    route,
    ...row
  }: {
    route: SettingsPage;
    icon: Glyph;
    iconName: IconName;
    label: string;
    hint: string;
    look: AboutLook;
  } = $props();
</script>

<AboutLinkRow href={resolve(route)} {...row} />
