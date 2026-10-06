<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { languageName } from "$lib/language/language";
  import { WindowWidth } from "$lib/page/breakpoints";
  import { isPhone } from "$lib/page/platform";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  import type { PageProps } from "./$types";

  const CHEVRON_SIZE = 18;

  let { data }: PageProps = $props();

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));

  const hintId = $props.id();
</script>

<SectionHeading title={m.general_title()} />
<div class="mbs-pane-gap flex flex-col gap-sm">
  <div class="rounded-list border border-border bg-card">
    <a
      href={resolve("/settings/general/language")}
      aria-describedby={onPhone ? hintId : undefined}
      class={[
        "flex items-center gap-md rounded-list py-xs ps-lg pe-md transition-colors min-block-phone-row hover:bg-hover active:bg-pressed motion-safe:duration-fade motion-safe:ease-out",
        "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
        "desktop:py-none desktop:ps-list-row desktop:min-block-settings-row",
      ]}
    >
      <span class="flex-1 font-semibold desktop:text-callout">
        {m.language_label()}
      </span>
      <span
        lang={getLocale()}
        class="text-callout text-muted touch:medium:text-label desktop:text-label"
      >
        {languageName(getLocale())}
      </span>
      <ChevronRight
        size={CHEVRON_SIZE}
        class="shrink-0 text-muted rtl:-scale-x-100"
      />
    </a>
  </div>
  {#if onPhone}
    <p id={hintId} class="px-xs text-footnote text-muted">
      {m.language_phone_hint()}
    </p>
  {/if}
</div>
