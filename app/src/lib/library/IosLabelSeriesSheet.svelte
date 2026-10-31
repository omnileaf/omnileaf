<script lang="ts">
  import { Plus, Tag, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { SheetBar } from "#lib/components/ui/drawer/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { SeriesId } from "#lib/series/series-id.ts";

  import { GROUPED_GROUP_LOOK } from "./group-look";
  import { LabelDraft } from "./label-draft.svelte";

  const ICON_SIZE = 20;
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

  const count = $derived(series.length);
  const draft = new LabelDraft(() => count);
  let newCategory = $state("");
  let newTag = $state("");
  let tagField = $state<HTMLInputElement | null>(null);

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
    draft.load(loaded.data);
    if (startsAtTags) {
      requestAnimationFrame(() => {
        tagField?.focus();
      });
    }
  }

  async function apply(): Promise<void> {
    const applied = await commands.labelSeries([...series], draft.changes());
    if (applied.status !== "ok") {
      onError(applied.error);
      return;
    }
    isOpen = false;
  }

  function close(): void {
    isOpen = false;
  }
</script>

<Dialog.Root bind:open={isOpen}>
  <ModalContent
    phoneClass=""
    phoneHeight="large"
    phoneGround="grouped"
    wideClass="inset-none m-auto flex flex-col overflow-hidden rounded-panel border border-dialog-edge bg-dialog text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    onDismiss={close}
  >
    <SheetBar
      title={m.library_labels_title()}
      closeLabel={m.library_close()}
      actionLabel={m.library_labels_done()}
      isActionPrimary
      onClose={close}
      onAction={() => {
        void apply();
      }}
    />
    <div
      class="flex flex-1 flex-col gap-xl overflow-y-auto pbs-sm pbe-sheet-bottom min-block-none"
    >
      <Dialog.Description class={GROUPED_GROUP_LOOK.section}>
        <span
          class="ps-lg text-native-group-footer/native-group-footer text-muted"
        >
          {m.library_labels_for({ count })}
        </span>
      </Dialog.Description>
      <section class={["flex flex-col", GROUPED_GROUP_LOOK.section]}>
        <h3 class={GROUPED_GROUP_LOOK.heading}>{m.library_categories()}</h3>
        <div class={GROUPED_GROUP_LOOK.group}>
          {#each draft.labels?.categories ?? [] as held (held.category.id)}
            {@const choice = draft.choiceOf(held)}
            <label class="flex items-center gap-md py-sm">
              <Checkbox
                class={[
                  "rounded-full aria-checked:border-transparent aria-checked:bg-native-button-primary",
                  choice === "some" &&
                    "border-transparent bg-native-button-primary",
                ]}
                bind:checked={
                  () => choice === "all",
                  (isChecked: boolean) => {
                    draft.choices[held.category.id] = isChecked
                      ? "all"
                      : "none";
                  }
                }
                indeterminate={choice === "some"}
                aria-label={choice === "some"
                  ? `${held.category.name} ${m.library_in_some({ holding: held.holding, count })}`
                  : held.category.name}
              />
              <span class="flex flex-col">
                <span class="text-native-row-title/native-row-title">
                  {held.category.name}
                </span>
                {#if choice === "some"}
                  <span
                    class="text-native-group-footer/native-group-footer text-muted"
                  >
                    {m.library_in_some({ holding: held.holding, count })}
                  </span>
                {/if}
              </span>
            </label>
          {/each}
          {#each draft.created as name (name)}
            <label class="flex items-center gap-md py-sm">
              <Checkbox
                class="rounded-full aria-checked:border-transparent aria-checked:bg-native-button-primary"
                bind:checked={
                  () => true,
                  () => {
                    draft.created = draft.created.filter(
                      (each) => each !== name,
                    );
                  }
                }
                aria-label={name}
              />
              <span class="text-native-row-title/native-row-title">
                {name}
              </span>
            </label>
          {/each}
          <div class="flex items-center gap-md text-muted block-native-target">
            <Plus size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
            <Input
              value={newCategory}
              oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
                newCategory = event.currentTarget.value;
              }}
              aria-label={m.library_new_category()}
              placeholder={m.library_new_category()}
              class="text-native-row-title/native-row-title"
              onkeydown={(event: KeyboardEvent) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  draft.addCategory(newCategory);
                  newCategory = "";
                }
              }}
            />
          </div>
        </div>
      </section>
      <section class={["flex flex-col", GROUPED_GROUP_LOOK.section]}>
        <h3 class={GROUPED_GROUP_LOOK.heading}>{m.library_tags()}</h3>
        <div class={GROUPED_GROUP_LOOK.group}>
          <div class="flex items-center gap-md text-muted block-native-target">
            <Tag size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
            <Input
              bind:ref={tagField}
              value={newTag}
              oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
                newTag = event.currentTarget.value;
              }}
              aria-label={m.library_add_tag()}
              placeholder={m.library_add_tag()}
              class="text-native-row-title/native-row-title"
              onkeydown={(event: KeyboardEvent) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  draft.addTag(newTag);
                  newTag = "";
                }
              }}
            />
          </div>
          {#if draft.tagsShown.length > 0}
            <ul class="flex flex-wrap gap-sm py-sm">
              {#each draft.tagsShown as { tag, holding } (tag)}
                <li
                  class="flex items-center gap-2xs rounded-full bg-chip ps-md pe-xs text-small font-medium block-search-chip"
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
                      draft.removeTag(tag);
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
          {#if draft.suggested.length > 0}
            <div class="flex flex-col gap-sm py-sm">
              <span
                class="text-native-group-footer/native-group-footer text-muted"
              >
                {m.library_suggested_tags()}
              </span>
              <div class="flex flex-wrap gap-sm">
                {#each draft.suggested as tag (tag)}
                  <Button
                    type="button"
                    aria-label={m.library_add_named_tag({ tag })}
                    class="flex items-center gap-xs rounded-full bg-chip px-md text-small font-medium text-foreground block-search-chip touch:touch-target-around"
                    onclick={() => {
                      draft.addTag(tag);
                    }}
                  >
                    <Plus size={REMOVE_ICON_SIZE} aria-hidden="true" />
                    {tag}
                  </Button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </section>
    </div>
  </ModalContent>
</Dialog.Root>
