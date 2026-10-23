<script lang="ts">
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import { tick } from "svelte";

  import { resolve } from "$app/paths";
  import { type AboutLook, ROW_ICON_SIZES } from "#lib/about/look.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { LicenceGroup } from "./licences";

  const PREVIEW_SIZE = 3;

  const ROWS = {
    phone: "gap-sm ps-lg pe-md min-block-touch-target",
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

<section
  aria-labelledby={headingId}
  class={[
    "flex flex-col overflow-hidden rounded-list border border-border bg-card",
    GROUP_PLATE,
  ]}
>
  <h2
    id={headingId}
    translate="no"
    class="px-lg pbs-md pbe-xs text-small font-semibold"
  >
    {group.name}
  </h2>
  <ul class="divide-y divide-border">
    {#each shown as licensed, index (licensed.key)}
      <li>
        <a
          bind:this={links[index]}
          href={resolve("/(app)/settings/about/licences/[...package]", {
            package: licensed.key,
          })}
          class={[
            "flex items-center transition-control hover:bg-hover active:bg-pressed",
            ROWS[look],
          ]}
        >
          <span class="flex-1 truncate font-medium">
            <bdi translate="no">{licensed.name}</bdi>
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
        <Button
          type="button"
          look="row"
          class={["font-semibold text-accent inline-full", ROWS[look]]}
          onclick={() => {
            void showAll();
          }}
        >
          <span class="flex-1">
            {m.licences_show_all({ count: group.packages.length })}
          </span>
          <ChevronDown size={ROW_ICON_SIZES[look]} class="shrink-0" />
        </Button>
      </li>
    {/if}
  </ul>
</section>
