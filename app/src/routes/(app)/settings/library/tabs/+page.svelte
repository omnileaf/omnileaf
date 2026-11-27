<script lang="ts">
  import { onMount, tick } from "svelte";

  import { assertNever } from "#lib/assert-never.ts";

  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import { reportFailure } from "#lib/errors/report-failure.ts";
  import {
    commands,
    type LibraryCategory,
    type LibraryTab,
  } from "#lib/ipc/bindings.ts";
  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { IosPhone } from "#lib/library/ios-phone.svelte.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import {
    ALL_SERIES,
    forgetTabUsedLast,
    LibraryOpensOn,
    OPENS_ON_LAST_TAB,
  } from "#lib/library/library-tab.svelte.ts";
  import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
  import {
    type ArrangedTab,
    arrangedTabs,
    type CategoryTab,
    NEW_LIBRARY_TABS,
    tabKey,
  } from "#lib/library/library-tabs.ts";
  import DeleteCategoryDialog from "#lib/library/DeleteCategoryDialog.svelte";
  import LibraryTabsList from "#lib/library/LibraryTabsList.svelte";
  import type { RefusedName } from "#lib/library/category-name.ts";
  import RenameCategoryDialog from "#lib/library/RenameCategoryDialog.svelte";
  import GroupedChoiceRow from "#lib/settings/GroupedChoiceRow.svelte";
  import SettingChoiceRow from "#lib/settings/SettingChoiceRow.svelte";
  import NewCategoryDialog from "#lib/library/NewCategoryDialog.svelte";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import {
    ANDROID_CHOICE_CARD,
    FLUSH_NOTE,
  } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  const android = androidListLook();
  const ios = new IosPhone();

  let keptTabs = $state<readonly LibraryTab[]>(NEW_LIBRARY_TABS);
  let categories = $state<readonly LibraryCategory[]>([]);
  let seriesCounts = $state<ReadonlyMap<string, number>>(new Map());
  let keepsLabels = $state(false);
  let isNaming = $state(false);
  let renaming = $state<CategoryTab | undefined>();
  let isRenaming = $state(false);
  let refused = $state<RefusedName | undefined>();
  let deleting = $state<CategoryTab | undefined>();
  let isDeleting = $state(false);
  let focusAfterDelete: string | undefined;
  let said = $state<{ readonly text: string } | undefined>();
  const namesBesideRenamed = $derived(
    categories
      .filter(({ id }) => id !== renaming?.id.id)
      .map(({ name }) => name),
  );
  const isMac = currentPlatform() === "macos";
  const isAndroid = currentPlatform() === "android";
  const arranged = $derived(
    arrangedTabs(keptTabs, categories).map((tab) =>
      isMac && tab.id.kind === "all"
        ? { ...tab, name: m.library_tabs_all_mac() }
        : tab,
    ),
  );
  const opensOn = new LibraryOpensOn();
  const opensOnLabelId = $props.id();
  const openable = $derived(
    arranged
      .filter(({ isHidden }) => !isHidden)
      .map((tab) => ({ key: tabKey(tab.id), name: tab.name })),
  );
  const shownOpensOn = $derived(
    opensOn.choice === OPENS_ON_LAST_TAB ||
      openable.some(({ key }) => key === opensOn.choice)
      ? opensOn.choice
      : ALL_SERIES,
  );

  const opensOnChoices = $derived([
    { value: OPENS_ON_LAST_TAB, label: m.library_opens_on_last() },
    ...openable.map(({ key, name }) => ({ value: key, label: name })),
  ]);

  function announce(text: string): void {
    said = { text };
  }

  function moreButtonOf(key: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[data-tab-row="${CSS.escape(key)}"] [data-tab-more]`,
    );
  }

  function asCategory(tab: ArrangedTab): CategoryTab | undefined {
    return tab.id.kind === "category" ? { ...tab, id: tab.id } : undefined;
  }

  function keyBeside(tab: CategoryTab): string | undefined {
    const at = arranged.findIndex(({ id }) => tabKey(id) === tab.id.id);
    const beside = arranged[at + 1] ?? arranged[at - 1];
    return beside === undefined ? undefined : tabKey(beside.id);
  }

  async function rename(tab: CategoryTab, to: string): Promise<void> {
    if (isRenaming) {
      return;
    }
    isRenaming = true;
    const renamed = await commands.renameLibraryCategory(tab.id.id, to);
    isRenaming = false;
    if (renamed.status === "error") {
      renaming = undefined;
      reportError(renamed.error);
      return;
    }
    await loadCategories();
    switch (renamed.data.kind) {
      case "renamed":
        renaming = undefined;
        announce(m.library_tabs_renamed({ tab: tab.name, name: to }));
        return;
      case "gone":
        renaming = undefined;
        return;
      case "nameTaken":
        refused = { name: to, problem: "taken" };
        return;
      case "nameEmpty":
        refused = { name: to, problem: "empty" };
        return;
      default:
        assertNever(renamed.data);
    }
  }

  async function remove(tab: CategoryTab): Promise<void> {
    isDeleting = true;
    focusAfterDelete = keyBeside(tab);
    const removed = await commands.removeLibraryCategory(tab.id.id);
    await Promise.all([loadCategories(), loadTabs()]);
    isDeleting = false;
    deleting = undefined;
    if (removed.status === "error") {
      focusAfterDelete = undefined;
      reportError(removed.error);
      return;
    }
    opensOn.forget(tab.id.id);
    forgetTabUsedLast(tab.id.id);
    announce(m.library_tabs_deleted({ tab: tab.name }));
  }

  async function focusBesideDeleted(event: Event): Promise<void> {
    const key = focusAfterDelete;
    focusAfterDelete = undefined;
    if (key === undefined) {
      return;
    }
    event.preventDefault();
    await tick();
    moreButtonOf(key)?.focus();
  }

  function chooseOpensOn(choice: string): void {
    opensOn.choose(choice);
  }

  const opensOnLabel = $derived(
    shownOpensOn === OPENS_ON_LAST_TAB
      ? m.library_opens_on_last()
      : (openable.find(({ key }) => key === shownOpensOn)?.name ??
          m.library_opens_on_last()),
  );

  function detailOf(tab: ArrangedTab): string {
    switch (tab.id.kind) {
      case "all":
        return m.library_tabs_all_detail();
      case "newChapters":
        return tab.isHidden
          ? m.library_tabs_built_in_hidden()
          : m.library_tabs_built_in();
      case "category": {
        const count = seriesCounts.get(tab.id.id);
        return count === undefined
          ? m.library_tabs_category()
          : m.library_tabs_category_count({ count });
      }
    }
  }

  async function arrange(next: readonly ArrangedTab[]): Promise<void> {
    keptTabs = next.map(({ id, isHidden }) => ({ id, isHidden }));
    const saved = await commands.setLibraryTabs([...keptTabs]);
    if (saved.status === "error") {
      reportError(saved.error);
    }
  }

  async function loadTabs(): Promise<void> {
    const kept = await commands.libraryTabs();
    if (kept.status === "ok") {
      keptTabs = kept.data;
    }
  }

  async function loadCategories(): Promise<void> {
    const kept = await commands.libraryCategories();
    if (kept.status !== "ok") {
      return;
    }
    categories = kept.data;
    const counted = await Promise.all(
      kept.data.map(async ({ id }) => {
        const count = await commands.categorySeriesCount(
          id,
          NEW_LIBRARY_LISTING.filter,
        );
        return [id, count.status === "ok" ? count.data : undefined] as const;
      }),
    );
    seriesCounts = new Map(
      counted.flatMap(([id, count]) =>
        count === undefined ? [] : [[id, count] as const],
      ),
    );
  }

  async function loadLabelSupport(): Promise<void> {
    const labels = await commands.seriesLabels([]);
    keepsLabels = labels.status === "ok" && labels.data.keepsLabels;
  }

  async function addCategory(name: string): Promise<void> {
    isNaming = false;
    const added = await commands.labelSeries([], {
      categoriesAdded: [],
      categoriesRemoved: [],
      categoriesCreated: [name],
      tagsAdded: [],
      tagsRemoved: [],
    });
    if (added.status === "error") {
      reportError(added.error);
      return;
    }
    await loadCategories();
  }

  onMount(() => {
    void loadTabs();
    void loadCategories();
    void loadLabelSupport();
    return listenForLibraryChanges(() => {
      void loadCategories();
    }, reportFailure);
  });
</script>

<GroupedGround>
  <SectionHeading
    title={isMac ? m.library_tabs_title_mac() : m.library_tabs_title()}
    parent={{ route: "/(app)/settings/library", title: m.library_title() }}
  />
  <div
    class="mbs-pane-gap flex flex-col gap-sm android:mbs-none android:gap-none"
  >
    <p class={android.isOn ? FLUSH_NOTE : "text-footnote text-muted"}>
      {#if isMac}
        {m.library_tabs_intro_mac()}
      {:else}
        <span class="desktop:hidden">{m.library_tabs_intro()}</span>
        <span class="hidden desktop:inline">{m.library_tabs_intro_keys()}</span>
      {/if}
    </p>
    <LibraryTabsList
      tabs={arranged}
      {detailOf}
      onArrange={(next: readonly ArrangedTab[]) => {
        void arrange(next);
      }}
      onNewCategory={keepsLabels
        ? () => {
            isNaming = true;
          }
        : undefined}
      onRename={keepsLabels
        ? (tab: ArrangedTab) => {
            refused = undefined;
            renaming = asCategory(tab);
          }
        : undefined}
      onDelete={keepsLabels
        ? (tab: ArrangedTab) => {
            deleting = asCategory(tab);
          }
        : undefined}
      {said}
    />
  </div>
  {#if android.isOn}
    <div data-settings-group class="flex flex-col">
      <SettingChoiceRow
        title={m.library_opens_on()}
        value={opensOnLabel}
        choices={opensOnChoices}
        chosen={shownOpensOn}
        onChoose={chooseOpensOn}
      />
    </div>
  {:else if isAndroid}
    <section class={["mbs-lg", ANDROID_CHOICE_CARD]}>
      <SettingChoiceRow
        bleed=""
        title={m.library_opens_on()}
        value={opensOnLabel}
        choices={opensOnChoices}
        chosen={shownOpensOn}
        onChoose={chooseOpensOn}
      />
    </section>
  {:else if ios.isOn}
    <div class="mbs-lg">
      <GroupedChoiceRow
        title={m.library_opens_on()}
        value={opensOnLabel}
        choices={opensOnChoices}
        chosen={shownOpensOn}
        onChoose={chooseOpensOn}
      />
    </div>
  {:else}
    <section class="mbs-lg rounded-card border border-border bg-card p-md">
      <div
        class="flex flex-col gap-sm desktop:medium:grid desktop:medium:grid-cols-setting-grid desktop:medium:items-center desktop:medium:gap-x-md"
      >
        <span id={opensOnLabelId} class="text-small font-medium">
          {m.library_opens_on()}
        </span>
        <NativeSelect
          aria-labelledby={opensOnLabelId}
          value={shownOpensOn}
          class="desktop:medium:inline-setting-control"
          fieldClass="touch:text-body touch:block-touch-target"
          choices={opensOnChoices}
          onChoose={chooseOpensOn}
        />
      </div>
    </section>
  {/if}
  <NewCategoryDialog
    isOpen={isNaming}
    onAdd={(name: string) => {
      void addCategory(name);
    }}
    onClose={() => {
      isNaming = false;
    }}
  />
  <RenameCategoryDialog
    name={renaming?.name}
    otherNames={namesBesideRenamed}
    {refused}
    isBusy={isRenaming}
    onRename={(to: string) => {
      if (renaming !== undefined) {
        void rename(renaming, to);
      }
    }}
    onClose={() => {
      renaming = undefined;
    }}
  />
  <DeleteCategoryDialog
    category={deleting === undefined
      ? undefined
      : {
          name: deleting.name,
          seriesCount: seriesCounts.get(deleting.id.id),
        }}
    isBusy={isDeleting}
    onDelete={() => {
      if (deleting !== undefined) {
        void remove(deleting);
      }
    }}
    onCancel={() => {
      deleting = undefined;
    }}
    onCloseAutoFocus={(event: Event) => {
      void focusBesideDeleted(event);
    }}
  />
</GroupedGround>
