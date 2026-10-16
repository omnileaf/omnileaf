<script lang="ts">
  import { Plus, Tag, Tags, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { commands, type SeriesLabels } from "#lib/ipc/bindings.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import type { SeriesId } from "#lib/series/series-id.ts";

  type Choice = "all" | "some" | "none";

  const ICON_SIZE = 16;
  const REMOVE_ICON_SIZE = 12;

  let {
    isOpen = $bindable(false),
    series,
    startsAtTags,
    onError,
  }: {
    isOpen?: boolean;
    series: readonly SeriesId[];
    startsAtTags: boolean;
    onError: (error: unknown) => void;
  } = $props();

  let labels = $state<SeriesLabels | undefined>();
  let choices = $state<Record<string, Choice>>({});
  let created = $state<string[]>([]);
  let tagsAdded = $state<string[]>([]);
  let tagsRemoved = $state<string[]>([]);
  let newCategory = $state("");
  let newTag = $state("");
  let tagField = $state<HTMLInputElement | null>(null);

  const count = $derived(series.length);
  const tagsShown = $derived([
    ...(labels?.tags ?? []).filter(({ tag }) => !tagsRemoved.includes(tag)),
    ...tagsAdded.map((tag) => ({ tag, holding: count })),
  ]);
  const suggested = $derived(
    (labels?.suggestedTags ?? []).filter(
      (tag) => !tagsShown.some((shown) => shown.tag === tag),
    ),
  );

  $effect(() => {
    if (isOpen) {
      untrack(() => {
        void load();
      });
    }
  });

  async function load(): Promise<void> {
    const loaded = await commands.seriesLabels([...series]);
    if (loaded.status !== "ok") {
      onError(loaded.error);
      return;
    }
    labels = loaded.data;
    choices = Object.fromEntries(
      loaded.data.categories.map(({ category, holding }) => [
        category.id,
        holding === 0 ? "none" : holding >= count ? "all" : "some",
      ]),
    );
    created = [];
    tagsAdded = [];
    tagsRemoved = [];
    if (startsAtTags) {
      requestAnimationFrame(() => {
        tagField?.focus();
      });
    }
  }

  function addCategory(): void {
    const name = newCategory.trim();
    if (name !== "" && !created.includes(name)) {
      created = [...created, name];
    }
    newCategory = "";
  }

  function addTag(tag: string): void {
    const name = tag.trim();
    if (name === "") {
      return;
    }
    if (tagsRemoved.includes(name)) {
      tagsRemoved = tagsRemoved.filter((removed) => removed !== name);
    } else if (!tagsShown.some((shown) => shown.tag === name)) {
      tagsAdded = [...tagsAdded, name];
    }
  }

  function removeTag(tag: string): void {
    if (tagsAdded.includes(tag)) {
      tagsAdded = tagsAdded.filter((added) => added !== tag);
    } else {
      tagsRemoved = [...tagsRemoved, tag];
    }
  }

  async function apply(): Promise<void> {
    const held = labels?.categories ?? [];
    const applied = await commands.labelSeries([...series], {
      categoriesAdded: held
        .filter(
          ({ category, holding }) =>
            choices[category.id] === "all" && holding < count,
        )
        .map(({ category }) => category.id),
      categoriesRemoved: held
        .filter(
          ({ category, holding }) =>
            choices[category.id] === "none" && holding > 0,
        )
        .map(({ category }) => category.id),
      categoriesCreated: created,
      tagsAdded,
      tagsRemoved,
    });
    if (applied.status !== "ok") {
      onError(applied.error);
      return;
    }
    isOpen = false;
  }
</script>

<Dialog.Root bind:open={isOpen}>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col overflow-hidden rounded-panel border border-dialog-edge bg-dialog text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    phoneClass="inset-bs-sheet-top block-auto"
    onDismiss={() => {
      isOpen = false;
    }}
  >
    {#snippet children(view)}
      <div
        class={[
          "flex flex-1 flex-col gap-md overflow-y-auto min-block-none",
          view === "wide" ? "p-lg" : "px-sheet-inline pbs-md",
        ]}
      >
        <div class="flex items-start gap-md">
          <HeaderBadge icon={Tags} look="header-accent" />
          <div class="flex flex-col gap-2xs">
            <DialogTitle class="text-title font-bold">
              {m.library_labels_title()}
            </DialogTitle>
            <Dialog.Description class="text-detail text-muted">
              {m.library_labels_for({ count })}
            </Dialog.Description>
          </div>
        </div>
        <section class="flex flex-col">
          <h3 class="text-small font-semibold">{m.library_categories()}</h3>
          <div class="flex flex-col divide-y divide-border">
            {#each labels?.categories ?? [] as { category, holding } (category.id)}
              {@const choice = choices[category.id] ?? "none"}
              <label class="flex items-center gap-md py-sm">
                <Checkbox
                  bind:checked={
                    () => choice === "all",
                    (isChecked: boolean) => {
                      choices[category.id] = isChecked ? "all" : "none";
                    }
                  }
                  indeterminate={choice === "some"}
                  aria-label={choice === "some"
                    ? `${category.name} ${m.library_in_some({ holding, count })}`
                    : category.name}
                />
                <span class="flex flex-col">
                  <span class="text-body">{category.name}</span>
                  {#if choice === "some"}
                    <span class="text-detail text-muted">
                      {m.library_in_some({ holding, count })}
                    </span>
                  {/if}
                </span>
              </label>
            {/each}
            {#each created as name (name)}
              <label class="flex items-center gap-md py-sm">
                <Checkbox
                  bind:checked={
                    () => true,
                    () => {
                      created = created.filter((each) => each !== name);
                    }
                  }
                  aria-label={name}
                />
                <span class="text-body">{name}</span>
              </label>
            {/each}
          </div>
          <InputGroup
            class="mbs-sm gap-sm rounded-control border border-border bg-background px-md text-muted block-pointer-button focus-within:border-accent touch:block-touch-target"
          >
            <Plus size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
            <Input
              value={newCategory}
              oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
                newCategory = event.currentTarget.value;
              }}
              aria-label={m.library_new_category()}
              placeholder={m.library_new_category()}
              class="text-small text-foreground touch:text-body"
              onkeydown={(event: KeyboardEvent) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCategory();
                }
              }}
            />
          </InputGroup>
        </section>
        <section class="flex flex-col gap-sm">
          <h3 class="text-small font-semibold">{m.library_tags()}</h3>
          <InputGroup
            class="gap-sm rounded-control border border-border bg-background px-md text-muted block-pointer-button focus-within:border-accent touch:block-touch-target"
          >
            <Tag size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
            <Input
              bind:ref={tagField}
              value={newTag}
              oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
                newTag = event.currentTarget.value;
              }}
              aria-label={m.library_add_tag()}
              placeholder={m.library_add_tag()}
              class="text-small text-foreground touch:text-body"
              onkeydown={(event: KeyboardEvent) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag(newTag);
                  newTag = "";
                }
              }}
            />
          </InputGroup>
          {#if tagsShown.length > 0}
            <ul class="flex flex-wrap gap-sm">
              {#each tagsShown as { tag, holding } (tag)}
                <li
                  class={[
                    "flex items-center gap-2xs rounded-control border ps-sm pe-2xs text-small font-medium block-search-chip",
                    holding >= count
                      ? "border-transparent bg-chip"
                      : "border-border bg-card",
                  ]}
                >
                  {holding >= count
                    ? tag
                    : m.library_tag_on_some({ tag, holding, count })}
                  <Button
                    type="button"
                    look="icon"
                    aria-label={m.library_remove_tag({ tag })}
                    class="block-chip-remove inline-chip-remove touch:touch-target-around"
                    onclick={() => {
                      removeTag(tag);
                    }}
                  >
                    <X
                      size={REMOVE_ICON_SIZE}
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  </Button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if suggested.length > 0}
            <div class="flex flex-wrap items-center gap-sm">
              <span class="text-detail text-muted">
                {m.library_suggested_tags()}
              </span>
              {#each suggested as tag (tag)}
                <Button
                  type="button"
                  look="outline"
                  aria-label={m.library_add_named_tag({ tag })}
                  class="flex items-center gap-xs rounded-control px-sm text-small font-medium block-search-chip touch:touch-target-around"
                  onclick={() => {
                    addTag(tag);
                  }}
                >
                  <Plus size={REMOVE_ICON_SIZE} aria-hidden="true" />
                  {tag}
                </Button>
              {/each}
            </div>
          {/if}
        </section>
      </div>
      <div
        class={[
          "flex gap-sm",
          view === "wide"
            ? "px-lg pbe-lg"
            : "border-bs border-border px-sheet-inline pbs-md pbe-sheet-bottom",
        ]}
      >
        {#if view === "wide"}
          <Button
            type="button"
            look="outline"
            class="flex-1 rounded-control font-medium min-block-pointer-button"
            onclick={() => {
              isOpen = false;
            }}
          >
            {m.library_cancel()}
          </Button>
        {/if}
        <Button
          type="button"
          look="filled"
          class="flex-1 rounded-control font-semibold min-block-pointer-button touch:min-block-touch-target"
          onclick={() => {
            void apply();
          }}
        >
          {m.library_labels_done()}
        </Button>
      </div>
    {/snippet}
  </ModalContent>
</Dialog.Root>
