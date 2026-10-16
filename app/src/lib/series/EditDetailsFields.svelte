<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Textarea } from "#lib/components/ui/textarea/index.ts";
  import type { SeriesDetails } from "#lib/ipc/bindings.ts";
  import type { UndoOffer } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import {
    type DetailDraft,
    type EditableField,
    isEdited,
    withFileValue,
  } from "./detail-edits.ts";
  import {
    backToFileTitle,
    fileValuesWording,
    personLabel,
    removePersonLabel,
    useFileLabel,
  } from "./detail-wording.ts";
  import AddDetailChip from "./AddDetailChip.svelte";
  import { DETAIL_CHIP } from "./detail-chip.ts";
  import DetailFieldHead from "./DetailFieldHead.svelte";

  const PEOPLE_SHOWN_FIRST = 8;
  const ICON_SIZE = 16;
  const FIELD = "flex flex-col gap-sm py-md";
  const FROM_FILE = "text-label text-foreground/80";

  let {
    details,
    draft,
    onDraft,
    offerUndo,
  }: {
    details: SeriesDetails;
    draft: DetailDraft;
    onDraft: (draft: DetailDraft) => void;
    offerUndo: (offer: UndoOffer) => void;
  } = $props();

  const id = $props.id();
  let isShowingEveryone = $state(false);

  const edited = $derived({
    title: isEdited("title", details, draft),
    people: isEdited("people", details, draft),
    tags: isEdited("tags", details, draft),
    summary: isEdited("summary", details, draft),
  });
  const peopleShown = $derived(
    isShowingEveryone || draft.people.length <= PEOPLE_SHOWN_FIRST
      ? draft.people
      : draft.people.slice(0, PEOPLE_SHOWN_FIRST),
  );

  function listedFromFile(
    field: "people" | "tags",
    values: readonly string[],
  ): string | undefined {
    if (!edited[field]) {
      return m.edit_details_from_file();
    }
    return values.length === 0 ? undefined : fileValuesWording(values);
  }

  const fromFile = $derived({
    title: edited.title
      ? m.edit_details_from_file_quoted({ value: details.title.fromFile })
      : m.edit_details_file_title(),
    people: listedFromFile("people", details.people.fromFile.map(personLabel)),
    tags: listedFromFile("tags", details.tags.fromFile),
    summary: !edited.summary
      ? m.edit_details_from_file()
      : details.summary.fromFile === null
        ? undefined
        : m.edit_details_from_file_quoted({ value: details.summary.fromFile }),
  });

  function useFile(field: EditableField): void {
    const before = draft;
    onDraft(withFileValue(field, details, draft));
    offerUndo({
      title: backToFileTitle(field),
      undo: () => {
        onDraft({ ...draft, [field]: before[field] });
      },
    });
  }

  function removePerson(at: number): void {
    onDraft({
      ...draft,
      people: draft.people.filter((_, index) => index !== at),
    });
  }

  function removeTag(tag: string): void {
    onDraft({ ...draft, tags: draft.tags.filter((kept) => kept !== tag) });
  }
</script>

<section
  class="flex flex-col divide-y divide-border rounded-card border border-border bg-card px-lg py-xs"
>
  <div class={FIELD}>
    <DetailFieldHead
      label={m.edit_details_title()}
      labelFor="{id}-title"
      isEdited={edited.title}
      useFileLabel={useFileLabel("title")}
      onUseFile={() => {
        useFile("title");
      }}
    />
    <Textarea
      id="{id}-title"
      rows={1}
      value={draft.title}
      oninput={(event: Event & { currentTarget: HTMLTextAreaElement }) => {
        onDraft({ ...draft, title: event.currentTarget.value });
      }}
      placeholder={details.title.fromFile}
      aria-describedby="{id}-title-file"
      class="text-body min-block-title-field touch:min-block-touch-target"
    />
    <p id="{id}-title-file" class={FROM_FILE}>{fromFile.title}</p>
  </div>
  <div class={FIELD}>
    <DetailFieldHead
      label={m.edit_details_people()}
      labelId="{id}-people"
      isEdited={edited.people}
      useFileLabel={useFileLabel("people")}
      onUseFile={() => {
        useFile("people");
      }}
    />
    <div
      role="group"
      aria-labelledby="{id}-people"
      class="flex flex-wrap items-center gap-sm"
    >
      {#each peopleShown as person, index (`${String(index)}·${person.name}`)}
        <button
          type="button"
          aria-label={removePersonLabel(person)}
          class={[DETAIL_CHIP, "pe-sm"]}
          onclick={() => {
            removePerson(index);
          }}
        >
          {personLabel(person)}
          <X size={ICON_SIZE} aria-hidden="true" />
        </button>
      {/each}
      {#if peopleShown.length < draft.people.length}
        <button
          type="button"
          class={[DETAIL_CHIP, "pe-md"]}
          onclick={() => {
            isShowingEveryone = true;
          }}
        >
          {m.edit_details_show_all({ count: draft.people.length })}
        </button>
      {/if}
      <AddDetailChip
        label={m.edit_details_add_person()}
        onAdd={(name: string) => {
          onDraft({
            ...draft,
            people: [...draft.people, { name, role: null }],
          });
        }}
      />
    </div>
    {#if fromFile.people !== undefined}
      <p class={FROM_FILE}>{fromFile.people}</p>
    {/if}
  </div>
  <div class={FIELD}>
    <DetailFieldHead
      label={m.edit_details_tags()}
      labelId="{id}-tags"
      isEdited={edited.tags}
      useFileLabel={useFileLabel("tags")}
      onUseFile={() => {
        useFile("tags");
      }}
    />
    <div
      role="group"
      aria-labelledby="{id}-tags"
      class="flex flex-wrap items-center gap-sm"
    >
      {#each draft.tags as tag (tag)}
        <button
          type="button"
          aria-label={m.edit_details_remove_named({ name: tag })}
          class={[DETAIL_CHIP, "pe-sm"]}
          onclick={() => {
            removeTag(tag);
          }}
        >
          {tag}
          <X size={ICON_SIZE} aria-hidden="true" />
        </button>
      {/each}
      <AddDetailChip
        label={m.edit_details_add_tag()}
        onAdd={(tag: string) => {
          if (!draft.tags.includes(tag)) {
            onDraft({ ...draft, tags: [...draft.tags, tag] });
          }
        }}
      />
    </div>
    {#if fromFile.tags !== undefined}
      <p class={FROM_FILE}>{fromFile.tags}</p>
    {/if}
  </div>
  <div class={FIELD}>
    <DetailFieldHead
      label={m.edit_details_summary()}
      labelFor="{id}-summary"
      isEdited={edited.summary}
      useFileLabel={useFileLabel("summary")}
      onUseFile={() => {
        useFile("summary");
      }}
    />
    <Textarea
      id="{id}-summary"
      rows={3}
      value={draft.summary}
      oninput={(event: Event & { currentTarget: HTMLTextAreaElement }) => {
        onDraft({ ...draft, summary: event.currentTarget.value });
      }}
      aria-describedby={fromFile.summary === undefined
        ? undefined
        : `${id}-summary-file`}
      class="text-body"
    />
    {#if fromFile.summary !== undefined}
      <p id="{id}-summary-file" class={FROM_FILE}>{fromFile.summary}</p>
    {/if}
  </div>
  {#if !details.isRatedAdult}
    <SettingSwitch
      label={m.edit_details_mark_adult()}
      description={m.edit_details_mark_adult_note()}
      isOn={draft.isMarkedAdult}
      onToggle={() => {
        onDraft({ ...draft, isMarkedAdult: !draft.isMarkedAdult });
      }}
      class="px-none"
    />
  {/if}
</section>
