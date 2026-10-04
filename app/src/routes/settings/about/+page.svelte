<script lang="ts">
  import appIcon from "$branding/icon.svg";
  import { m } from "$lib/paraglide/messages.js";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<SectionHeading title={m.about_title()} />
<div class="mbs-pane-gap flex flex-col gap-xl two-pane:max-inline-narrow">
  <section
    class="flex flex-col items-center gap-xs text-center two-pane:flex-row two-pane:gap-lg two-pane:text-start"
  >
    <img
      src={appIcon}
      alt=""
      class="block-app-icon inline-app-icon two-pane:block-4xl two-pane:inline-4xl"
    />
    <div>
      <h2
        class="mbs-sm text-app-name font-bold two-pane:mbs-none two-pane:text-bar-title"
      >
        {m.app_name()}
      </h2>
      <p class="text-callout text-muted two-pane:text-label">
        {m.app_version({ version: data.appInfo.version })}
      </p>
    </div>
  </section>
  <p
    class="px-md text-center text-footnote text-muted two-pane:px-none two-pane:text-start"
  >
    {m.about_licence()}
  </p>
</div>
