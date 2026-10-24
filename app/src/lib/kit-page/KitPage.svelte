<script lang="ts">
  import { BookOpen, Check, Plus } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";

  import { page } from "$app/state";
  import { parseThemePreference } from "#lib/appearance/theme.ts";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import {
    Item,
    ItemChevron,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import {
    commands,
    DEFAULT_LIBRARY_VIEW,
    type LibrarySeries,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
  import { setSeriesSelection } from "#lib/library/series-selection.ts";
  import SeriesCovers from "#lib/library/SeriesCovers.svelte";
  import AppNavigation from "#lib/navigation/AppNavigation.svelte";
  import {
    setSidebarSetting,
    SidebarSetting,
  } from "#lib/navigation/sidebar.svelte.ts";
  import ToastCard from "#lib/notices/ToastCard.svelte";
  import PageHeading from "#lib/page/PageHeading.svelte";
  import { CARD_PLATE, GROUP_PLATE } from "#lib/page/plates.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import type { SeriesId } from "#lib/series/series-id.ts";
  import SeriesBar from "#lib/series/SeriesBar.svelte";

  type View = (typeof VIEWS)[number];

  const VARIANTS = [
    "primary",
    "secondary",
    "outline",
    "plain",
    "destructive",
    "link",
  ] as const;
  const SIZES = ["small", "regular", "large"] as const;
  const SEGMENT_SIZES = ["small", "regular"] as const;
  const VIEWS = ["grid", "list", "board"] as const;
  const VIEW_LABELS = {
    grid: () => "Grid",
    list: () => "List",
    board: () => "Board",
  };
  const SHOWN_COVERS = 3;
  const TOAST_ICON_SIZE = 20;
  const COVERS_VIEW = {
    ...DEFAULT_LIBRARY_VIEW,
    onCovers: {
      ...DEFAULT_LIBRARY_VIEW.onCovers,
      showsUnreadCount: true,
      showsDownloaded: true,
      showsLanguage: true,
    },
  };

  const themeSetting = getThemeSetting();
  $effect(() => {
    const asked = parseThemePreference(page.url.searchParams.get("theme"));
    untrack(() => {
      themeSetting.preview(asked);
    });
    return () => {
      themeSetting.endPreview();
    };
  });

  setSidebarSetting(new SidebarSetting(undefined));
  const selection = new Selection<SeriesId>();
  setSeriesSelection(selection);

  let view: View = $state("grid");
  let isSheetOpen = $state(false);
  let series: readonly LibrarySeries[] = $state([]);

  void commands.librarySeries(null, NEW_LIBRARY_LISTING).then((listed) => {
    if (listed.status === "ok") {
      series = listed.data.series.slice(0, SHOWN_COVERS);
      selection.begin(series[0]?.id);
    }
  });

  const HEADING = "text-title font-semibold";

  function sectionId(section: string): string {
    return `kit-${section.replaceAll(" ", "-")}`;
  }
</script>

<main
  class="flex flex-col gap-xl p-lg touch:bg-native-grouped-ground"
  data-ground="grouped"
>
  <h1 class="text-page-title font-bold">Phone kit parts</h1>

  <section aria-labelledby={sectionId("Buttons")} class="flex flex-col gap-md">
    <h2 id={sectionId("Buttons")} class={HEADING}>Buttons</h2>
    {#each SIZES as size (size)}
      <div class="flex flex-wrap items-center gap-sm">
        {#each VARIANTS as variant (variant)}
          <Button {variant} {size}>{variant}</Button>
        {/each}
        <Button variant="secondary" {size} iconOnly label="Add">
          <Plus aria-hidden="true" />
        </Button>
      </div>
    {/each}
    <Button variant="primary" disabled class="self-start">Disabled</Button>
  </section>

  <section aria-labelledby={sectionId("Controls")} class="flex flex-col gap-md">
    <h2 id={sectionId("Controls")} class={HEADING}>Controls</h2>
    <div class="flex items-center gap-md">
      <Switch aria-label="Switch off" />
      <Switch checked aria-label="Switch on" />
      <Switch disabled aria-label="Switch disabled" />
    </div>
    {#each SEGMENT_SIZES as size (size)}
      <p id="kit-view-{size}">View, {size}</p>
      <SegmentedControl
        options={VIEWS}
        labels={VIEW_LABELS}
        chosen={view}
        labelledBy="kit-view-{size}"
        {size}
        onChoose={(option: View) => {
          view = option;
        }}
      />
    {/each}
    <Progress value={40} aria-label="Reading progress" />
    <Progress value={null} aria-label="Loading" />
  </section>

  <section aria-labelledby={sectionId("Lists")} class="flex flex-col gap-md">
    <h2 id={sectionId("Lists")} class={HEADING}>Lists</h2>
    <ul class={["row-rules overflow-hidden border", GROUP_PLATE]}>
      <li>
        <Item look="row">
          <ItemContent><ItemTitle>Reading</ItemTitle></ItemContent>
          <ItemChevron />
        </Item>
      </li>
      <li>
        <Item look="row">
          <ItemContent>
            <ItemTitle>Storage</ItemTitle>
            <ItemDescription>2.1 GB used</ItemDescription>
          </ItemContent>
        </Item>
      </li>
      <li>
        <Item look="row">
          <ItemMedia><BookOpen aria-hidden="true" /></ItemMedia>
          <ItemContent><ItemTitle>Library</ItemTitle></ItemContent>
          <ItemChevron />
        </Item>
      </li>
    </ul>
    <div class={["border p-lg", CARD_PLATE]}>
      <p>A card holds one thing, such as the book you are reading.</p>
    </div>
  </section>

  <section aria-labelledby={sectionId("Top bar")} class="flex flex-col gap-md">
    <h2 id={sectionId("Top bar")} class={HEADING}>Top bar</h2>
    <PageHeading title="Library" />
    <SeriesBar
      title="Sample Series 01"
      isTitleUnderBar
      onMarkAll={() => Promise.resolve()}
      onLabel={undefined}
      onEditDetails={undefined}
      showFolder={{ label: "Show in folder", onShow: undefined }}
    />
  </section>

  <section aria-labelledby={sectionId("Covers")} class="flex flex-col gap-md">
    <h2 id={sectionId("Covers")} class={HEADING}>Covers</h2>
    <SeriesCovers
      {series}
      isComplete
      {coverUrl}
      view={COVERS_VIEW}
      usesStandIns={false}
    />
  </section>

  <section aria-labelledby={sectionId("Overlays")} class="flex flex-col gap-md">
    <h2 id={sectionId("Overlays")} class={HEADING}>Overlays</h2>
    <ToastCard
      tone="plain"
      title="Marked Volume 3 read"
      action={{ label: "Undo", run: () => undefined }}
      onDismiss={() => undefined}
    >
      {#snippet icon()}<Check size={TOAST_ICON_SIZE} />{/snippet}
    </ToastCard>
    <Dialog.Root bind:open={isSheetOpen}>
      <Button
        variant="secondary"
        onclick={() => {
          isSheetOpen = true;
        }}>Open sheet</Button
      >
      <DrawerContent
        aria-label="Volume 3"
        onDismiss={() => {
          isSheetOpen = false;
        }}
      >
        <p class="p-lg">Mark read</p>
      </DrawerContent>
    </Dialog.Root>
  </section>

  <section
    aria-labelledby={sectionId("Tab bar")}
    class="transform-gpu pbe-floating-clearance"
  >
    <h2 id={sectionId("Tab bar")} class={HEADING}>Tab bar</h2>
    <AppNavigation current="library" />
  </section>
</main>
