<script lang="ts">
  import { Card } from "#lib/components/ui/card/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let {
    title,
    readSeconds,
    pageCount,
    secondsPerPage,
  }: {
    title: string;
    readSeconds: number;
    pageCount: number;
    secondsPerPage: number;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isOnPhone = $derived(isPhone(platform, width.current));
  const pages = $derived(new Intl.NumberFormat(getLocale()).format(pageCount));
  const stats = $derived([
    { value: readingTime(readSeconds), label: m.reader_stat_reading() },
    { value: pages, label: m.reader_stat_pages({ count: pageCount }) },
    {
      value: m.reader_stat_seconds({ seconds: secondsPerPage }),
      label: m.reader_stat_a_page(),
    },
  ]);
</script>

<Card
  role="group"
  aria-label={m.reader_stats_label({ title })}
  class={isOnPhone
    ? "grid grid-cols-stats justify-between gap-x-lg gap-y-sm p-lg"
    : "grid grid-cols-3 gap-sm p-lg expanded:px-xl"}
>
  {#each stats as { value, label } (label)}
    <div class="flex flex-col min-inline-none">
      <p
        class={[
          isOnPhone
            ? "text-native-end-stat/native-end-stat font-native-end-stat"
            : "text-title font-semibold",
          "wrap-break-word tabular-nums",
        ]}
      >
        {value}
      </p>
      <p class="text-caption wrap-break-word text-muted">{label}</p>
    </div>
  {/each}
</Card>
