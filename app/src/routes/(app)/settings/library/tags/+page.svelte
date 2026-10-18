<script lang="ts">
  import { Pencil, Search, Trash } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { commands, type LibraryTag } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import RenameTagDialog from "#lib/library/RenameTagDialog.svelte";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  const ICON_SIZE = 16;
  const ROW_BUTTON =
    "transition-control block-touch-target inline-touch-target hover:bg-hover active:bg-pressed ios:rounded-ios-button desktop:rounded-shadcn-control desktop:block-compact-button desktop:inline-compact-button";

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

<SectionHeading
  title={m.manage_tags_title()}
  parent={{ route: "/(app)/settings/library", title: m.library_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <InputGroup
    class="gap-sm rounded-control border border-border bg-card px-md text-muted block-pointer-button focus-within:border-accent touch:block-touch-target"
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
    <p class="text-footnote text-muted">{m.manage_tags_none()}</p>
  {:else}
    <p class="text-footnote text-muted">
      {m.manage_tags_intro({ count: tags.length })}
    </p>
    <ul
      id={listId}
      aria-label={m.manage_tags_list()}
      class="flex flex-col divide-y divide-border rounded-card border border-border bg-card"
    >
      {#each shown as tag (tag.name)}
        <li class="flex items-center gap-sm py-sm ps-list-row pe-sm">
          <span class="flex flex-1 flex-col gap-2xs min-inline-none">
            <span class="truncate font-medium">{tag.name}</span>
            <span class="text-detail text-muted">
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
