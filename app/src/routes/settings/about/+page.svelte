<script lang="ts">
  import appIcon from "../../../../../branding/icon.svg";

  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<SectionHeading title={m.about_title()} />
<div class="mbs-xl flex flex-col gap-xl expanded:max-inline-narrow">
  <section
    class="flex flex-col items-center gap-xs text-center expanded:flex-row expanded:gap-lg expanded:text-start"
  >
    <img
      src={appIcon}
      alt=""
      class="block-app-icon inline-app-icon expanded:block-4xl expanded:inline-4xl"
    />
    <div>
      <h2
        class="mbs-sm text-app-name font-bold expanded:mbs-none expanded:text-bar-title"
      >
        {m.app_name()}
      </h2>
      <p class="text-callout text-muted expanded:text-label">
        {m.app_version({ version: data.appInfo.version })}
      </p>
    </div>
  </section>
  <p
    class="px-md text-center text-footnote text-muted expanded:px-none expanded:text-start"
  >
    {m.about_licence()}
  </p>
</div>
