<script lang="ts">
  import { Card } from "#lib/components/ui/card/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let {
    title,
    readSeconds,
    pageCount,
    secondsPerPage,
    isOnPhone,
  }: {
    title: string;
    readSeconds: number;
    pageCount: number;
    secondsPerPage: number;
    isOnPhone: boolean;
  } = $props();

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
    ? "grid grid-cols-stats justify-between gap-x-lg p-lg"
    : "grid grid-cols-3 gap-sm p-lg expanded:px-xl"}
>
  {#each stats as { value, label } (label)}
    <div class="flex flex-col min-inline-none">
      <p
        class={[
          isOnPhone
            ? "text-native-end-stat/native-end-stat font-native-end-stat tracking-native-end-stat"
            : "text-title font-semibold",
          "wrap-break-word tabular-nums",
        ]}
      >
        {value}
      </p>
      <p
        class={[
          isOnPhone
            ? "text-native-end-stat-label/native-end-stat-label font-native-end-stat-label tracking-native-end-stat-label"
            : "text-caption",
          "wrap-break-word text-muted",
        ]}
      >
        {label}
      </p>
    </div>
  {/each}
</Card>
