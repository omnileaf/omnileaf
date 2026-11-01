<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import {
    LIST_PLATE,
    LIST_ROW,
    LIST_TEXT,
    LIST_TITLE,
    LIST_WORDS,
  } from "./grouped-rows-look.ts";

  const CHEVRON_SIZE = 12;

  let {
    route,
    label,
    value,
    valueLang,
  }: {
    route: "/(app)/settings/general/language";
    label: string;
    value: string;
    valueLang: string;
  } = $props();
</script>

<section aria-label={label} class={["overflow-hidden", LIST_PLATE]}>
  <a
    href={resolve(route)}
    class={[
      LIST_ROW,
      LIST_TEXT,
      "-mx-native-group-inset px-native-group-inset transition-control focus-visible:focus-ring focus-visible:-outline-offset-2 active:bg-native-group-row-pressed",
    ]}
  >
    <span class={["flex-1 min-inline-none", LIST_TITLE, LIST_WORDS]}
      >{label}</span
    >
    <span lang={valueLang} class="text-muted">{value}</span>
    <ChevronRight
      size={CHEVRON_SIZE}
      aria-hidden="true"
      class="shrink-0 text-muted rtl:-scale-x-100"
    />
  </a>
</section>
