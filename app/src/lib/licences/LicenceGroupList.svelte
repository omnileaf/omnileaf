<script lang="ts">
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import { tick } from "svelte";

  import { resolve } from "$app/paths";
  import { type AboutLook, ROW_ICON_SIZES } from "$lib/about/look";
  import { m } from "$lib/paraglide/messages.js";

  import type { LicenceGroup } from "./licences";

  const PREVIEW_SIZE = 3;

  const HEADS = {
    phone: "justify-between px-xs",
    pane: "gap-sm touch:text-label",
  } satisfies Record<AboutLook, string>;

  const NAMES = {
    phone: "text-muted",
    pane: "text-foreground",
  } satisfies Record<AboutLook, string>;

  const ROWS = {
    phone: "gap-sm ps-lg pe-md min-block-package-row",
    pane: "gap-md ps-list-row pe-md text-label min-block-touch-target desktop:min-block-settings-row",
  } satisfies Record<AboutLook, string>;

  let { group, look }: { group: LicenceGroup; look: AboutLook } = $props();

  const headingId = $props.id();

  let isExpanded = $state(false);
  const links: HTMLAnchorElement[] = $state([]);

  const shown = $derived(
    isExpanded ? group.packages : group.packages.slice(0, PREVIEW_SIZE),
  );
  const hasMore = $derived(shown.length < group.packages.length);

  async function showAll(): Promise<void> {
    isExpanded = true;
    await tick();
    links[PREVIEW_SIZE]?.focus();
  }
</script>

<section aria-labelledby={headingId} class="flex flex-col gap-sm">
  <div class={["flex items-baseline text-footnote text-muted", HEADS[look]]}>
    <h2 id={headingId} translate="no" class={["font-semibold", NAMES[look]]}>
      {group.name}
    </h2>
    <span>{m.licences_package_count({ count: group.packages.length })}</span>
  </div>
  <ul
    class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card"
  >
    {#each shown as licensed, index (licensed.key)}
      <li>
        <a
          bind:this={links[index]}
          href={resolve("/settings/about/licences/[...package]", {
            package: licensed.key,
          })}
          class={["flex items-center", ROWS[look]]}
        >
          <span class="flex-1 truncate font-medium">
            <bdi translate="no">{licensed.name}</bdi>
          </span>
          <span class="text-footnote text-muted tabular-nums">
            {licensed.version}
          </span>
          <ChevronRight
            size={ROW_ICON_SIZES[look]}
            class="shrink-0 text-muted rtl:-scale-x-100"
          />
        </a>
      </li>
    {/each}
    {#if hasMore}
      <li>
        <button
          type="button"
          class={[
            "flex items-center text-start font-semibold text-accent inline-full",
            ROWS[look],
          ]}
          onclick={() => {
            void showAll();
          }}
        >
          <span class="flex-1">
            {m.licences_show_all({ count: group.packages.length })}
          </span>
          <ChevronDown size={ROW_ICON_SIZES[look]} class="shrink-0" />
        </button>
      </li>
    {/if}
  </ul>
</section>
