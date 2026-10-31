<script lang="ts">
  import { Pencil, Search, Trash } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { commands, type LibraryTag } from "#lib/ipc/bindings.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { IosPhone } from "#lib/library/ios-phone.svelte.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import RenameTagDialog from "#lib/library/RenameTagDialog.svelte";
  import SwipeActions from "#lib/library/SwipeActions.svelte";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { RowSwipe } from "#lib/series/row-swipe.svelte.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  const ICON_SIZE = 16;
  const ANDROID_NOTE = `pbs-sm pbe-sm text-muted ${ROW_SUBTITLE_TYPE}`;
  const ROW_BUTTON =
    "transition-control block-touch-target inline-touch-target hover:bg-hover active:bg-pressed ios:rounded-ios-button desktop:rounded-shadcn-control desktop:block-compact-button desktop:inline-compact-button";

  const android = new AndroidPhone();
  const ios = new IosPhone();
  const swipe = new RowSwipe((side) => side === "towardStart");
  const notices = getNotices();
  const locale = getLocale();
  let tags = $state<readonly LibraryTag[]>([]);
  let found = $state("");
  let renaming = $state<string | undefined>();
  const listId = $props.id();

  const shown = $derived(
    tags.filter((tag) =>
      tag.name
        .toLocaleLowerCase(locale)
        .includes(found.trim().toLocaleLowerCase(locale)),
    ),
  );

  async function loadTags(): Promise<void> {
    const kept = await commands.libraryTags();
    if (kept.status === "error") {
      reportError(kept.error);
      return;
    }
    tags = kept.data;
  }

  async function rename(tag: string, to: string): Promise<void> {
    renaming = undefined;
    const renamed = await commands.renameLibraryTag(tag, to);
    if (renamed.status === "error") {
      reportError(renamed.error);
    }
    await loadTags();
  }

  async function remove(tag: string): Promise<void> {
    const removed = await commands.removeLibraryTag(tag);
    if (removed.status === "error") {
      reportError(removed.error);
      return;
    }
    tags = tags.filter((one) => one.name !== tag);
    notices.offerUndo({
      title: m.manage_tags_deleted({ tag }),
      undo: () => {
        void commands
          .labelSeries(removed.data, {
            categoriesAdded: [],
            categoriesRemoved: [],
            categoriesCreated: [],
            tagsAdded: [tag],
            tagsRemoved: [],
          })
          .then(loadTags);
      },
    });
  }

  onMount(() => {
    void loadTags();
    return listenForLibraryChanges(() => {
      void loadTags();
    }, reportError);
  });
</script>

<GroupedGround>
  <SectionHeading
    title={m.manage_tags_title()}
    parent={{ route: "/(app)/settings/library", title: m.library_title() }}
  />
  <div
    class={["mbs-pane-gap flex flex-col", android.isOn ? "gap-none" : "gap-sm"]}
  >
    <InputGroup
      class={android.isOn
        ? "gap-lg rounded-full bg-android-container-high ps-lg pe-lg text-muted block-native-row"
        : "gap-sm rounded-control border border-border bg-card px-md text-muted block-pointer-button focus-within:border-accent touch:block-touch-target"}
    >
      <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
      <Input
        type="search"
        value={found}
        oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
          found = event.currentTarget.value;
        }}
        aria-label={m.manage_tags_find()}
        placeholder={m.manage_tags_find()}
        class="no-search-cancel text-small text-foreground touch:text-body"
      />
    </InputGroup>
    {#if tags.length === 0}
      <p class={android.isOn ? ANDROID_NOTE : "text-footnote text-muted"}>
        {m.manage_tags_none()}
      </p>
    {:else}
      <p class={android.isOn ? ANDROID_NOTE : "text-footnote text-muted"}>
        {m.manage_tags_intro({ count: tags.length })}
      </p>
      <ul
        id={listId}
        aria-label={m.manage_tags_list()}
        class={android.isOn
          ? "-mx-page-start -me-page-end flex flex-col"
          : ios.isOn
            ? `flex flex-col divide-y divide-ios-separator overflow-hidden ${GROUP_PLATE}`
            : "flex flex-col divide-y divide-border rounded-card border border-border bg-card"}
      >
        {#each shown as tag (tag.name)}
          {#if ios.isOn}
            <li>
              <SwipeActions
                {swipe}
                key={tag.name}
                actions={[
                  {
                    name: "rename",
                    label: m.manage_tags_rename({ tag: tag.name }),
                    words: m.manage_tags_rename_action(),
                    isDestructive: false,
                    act: () => {
                      renaming = tag.name;
                    },
                  },
                  {
                    name: "delete",
                    label: m.manage_tags_delete({ tag: tag.name }),
                    words: m.manage_tags_delete_action(),
                    isDestructive: true,
                    act: () => {
                      void remove(tag.name);
                    },
                  },
                ]}
              >
                <span
                  class="flex items-center gap-md ps-lg pe-lg min-block-native-row"
                >
                  <span
                    class="flex-1 truncate text-native-row-title/native-row-title"
                    >{tag.name}</span
                  >
                  <span class="shrink-0 text-muted">
                    {m.library_series_count({ count: tag.seriesCount })}
                  </span>
                </span>
              </SwipeActions>
            </li>
          {:else}
            <li
              class={[
                "flex items-center",
                android.isOn
                  ? "gap-sm py-sm ps-lg pe-sm min-block-native-row-two"
                  : "gap-sm py-sm ps-list-row pe-sm",
              ]}
            >
              <span
                class={[
                  "flex flex-1 flex-col min-inline-none",
                  !android.isOn && "gap-2xs",
                ]}
              >
                <span
                  class={[
                    "truncate",
                    android.isOn ? "text-body" : "font-medium",
                  ]}>{tag.name}</span
                >
                <span
                  class={[
                    "text-muted",
                    android.isOn ? ROW_SUBTITLE_TYPE : "text-detail",
                  ]}
                >
                  {m.library_series_count({ count: tag.seriesCount })}
                </span>
              </span>
              <Tooltip label={m.manage_tags_rename({ tag: tag.name })}>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    look="icon"
                    class={ROW_BUTTON}
                    aria-label={m.manage_tags_rename({ tag: tag.name })}
                    onclick={() => {
                      renaming = tag.name;
                    }}
                  >
                    <Pencil size={ICON_SIZE} aria-hidden="true" />
                  </Button>
                {/snippet}
              </Tooltip>
              <Tooltip label={m.manage_tags_delete({ tag: tag.name })}>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    look="icon"
                    class={ROW_BUTTON}
                    aria-label={m.manage_tags_delete({ tag: tag.name })}
                    onclick={() => {
                      void remove(tag.name);
                    }}
                  >
                    <Trash size={ICON_SIZE} aria-hidden="true" />
                  </Button>
                {/snippet}
              </Tooltip>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  </div>
  <RenameTagDialog
    tag={renaming}
    onRename={(tag: string, to: string) => {
      void rename(tag, to);
    }}
    onClose={() => {
      renaming = undefined;
    }}
  />
</GroupedGround>
