<script lang="ts">
  import { X } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { GROUPED_FOOTNOTE_TYPE } from "#lib/library/group-look.ts";
  import { Textarea } from "#lib/components/ui/textarea/index.ts";
  import type { SeriesDetails } from "#lib/ipc/bindings.ts";
  import type { UndoOffer } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import {
    type DetailDraft,
    type EditableField,
    isEdited,
    isLeftEmpty,
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
  import { DETAIL_CHIP, GROUPED_DETAIL_CHIP } from "./detail-chip.ts";
  import DetailBox from "./DetailBox.svelte";
  import DetailFieldHead from "./DetailFieldHead.svelte";
  import LockedAdultMark from "./LockedAdultMark.svelte";

  const PEOPLE_SHOWN_FIRST = 8;
  const ICON_SIZE = 16;
  const FIELD = "flex flex-col gap-sm py-md";
  const GROUPED_FIELD = "flex flex-col gap-sm";
  const FROM_FILE = "text-label text-foreground/80";
  const GROUPED_FIELD_BOX = "border-0 bg-transparent p-none";

  let {
    details,
    countsAgeRatings,
    draft,
    isGrouped = false,
    onDraft,
    offerUndo,
  }: {
    details: SeriesDetails;
    countsAgeRatings: boolean;
    draft: DetailDraft;
    isGrouped?: boolean;
    onDraft: (draft: DetailDraft) => void;
    offerUndo: (offer: UndoOffer) => void;
  } = $props();

  const id = $props.id();
  const fromFileClass = $derived(
    isGrouped ? ["ps-lg", GROUPED_FOOTNOTE_TYPE] : FROM_FILE,
  );
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
    title: isLeftEmpty("title", draft)
      ? m.edit_details_title_left_empty({ value: details.title.fromFile })
      : edited.title
        ? m.edit_details_from_file_quoted({ value: details.title.fromFile })
        : m.edit_details_file_title(),
    people: listedFromFile("people", details.people.fromFile.map(personLabel)),
    tags: listedFromFile("tags", details.tags.fromFile),
    summary:
      isLeftEmpty("summary", draft) && details.summary.fromFile !== null
        ? m.edit_details_summary_left_empty()
        : !edited.summary
          ? m.edit_details_from_file()
          : details.summary.fromFile === null
            ? undefined
            : m.edit_details_from_file_quoted({
                value: details.summary.fromFile,
              }),
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
  class={isGrouped
    ? "flex flex-col gap-xl"
    : "flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card px-lg py-xs"}
>
  <div class={isGrouped ? GROUPED_FIELD : FIELD}>
    <DetailFieldHead
      label={m.edit_details_title()}
      labelFor="{id}-title"
      isEdited={edited.title}
      useFileLabel={useFileLabel("title")}
      onUseFile={() => {
        useFile("title");
      }}
    />
    <DetailBox {isGrouped}>
      <Textarea
        id="{id}-title"
        rows={1}
        value={draft.title}
        oninput={(event: Event & { currentTarget: HTMLTextAreaElement }) => {
          onDraft({ ...draft, title: event.currentTarget.value });
        }}
        placeholder={details.title.fromFile}
        aria-describedby="{id}-title-file"
        class={[
          "text-body min-block-title-field touch:min-block-touch-target",
          isGrouped && GROUPED_FIELD_BOX,
        ]}
      />
    </DetailBox>
    <p id="{id}-title-file" class={fromFileClass}>{fromFile.title}</p>
  </div>
  <div class={isGrouped ? GROUPED_FIELD : FIELD}>
    <DetailFieldHead
      label={m.edit_details_people()}
      labelId="{id}-people"
      isEdited={edited.people}
      useFileLabel={useFileLabel("people")}
      onUseFile={() => {
        useFile("people");
      }}
    />
    <DetailBox {isGrouped}>
      <div
        role="group"
        aria-labelledby="{id}-people"
        class="flex flex-wrap items-center gap-sm"
      >
        {#each peopleShown as person, index (`${String(index)}·${person.name}`)}
          <button
            type="button"
            aria-label={removePersonLabel(person)}
            class={cn(DETAIL_CHIP, "pe-sm", isGrouped && GROUPED_DETAIL_CHIP)}
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
            class={cn(DETAIL_CHIP, "pe-md", isGrouped && GROUPED_DETAIL_CHIP)}
            onclick={() => {
              isShowingEveryone = true;
            }}
          >
            {m.edit_details_show_all({ count: draft.people.length })}
          </button>
        {/if}
        <AddDetailChip
          {isGrouped}
          label={m.edit_details_add_person()}
          onAdd={(name: string) => {
            onDraft({
              ...draft,
              people: [...draft.people, { name, role: null }],
            });
          }}
        />
      </div>
    </DetailBox>
    {#if fromFile.people !== undefined}
      <p class={fromFileClass}>{fromFile.people}</p>
    {/if}
  </div>
  <div class={isGrouped ? GROUPED_FIELD : FIELD}>
    <DetailFieldHead
      label={m.edit_details_tags()}
      labelId="{id}-tags"
      isEdited={edited.tags}
      useFileLabel={useFileLabel("tags")}
      onUseFile={() => {
        useFile("tags");
      }}
    />
    <DetailBox {isGrouped}>
      <div
        role="group"
        aria-labelledby="{id}-tags"
        class="flex flex-wrap items-center gap-sm"
      >
        {#each draft.tags as tag (tag)}
          <button
            type="button"
            aria-label={m.edit_details_remove_named({ name: tag })}
            class={cn(DETAIL_CHIP, "pe-sm", isGrouped && GROUPED_DETAIL_CHIP)}
            onclick={() => {
              removeTag(tag);
            }}
          >
            {tag}
            <X size={ICON_SIZE} aria-hidden="true" />
          </button>
        {/each}
        <AddDetailChip
          {isGrouped}
          label={m.edit_details_add_tag()}
          onAdd={(tag: string) => {
            if (!draft.tags.includes(tag)) {
              onDraft({ ...draft, tags: [...draft.tags, tag] });
            }
          }}
        />
      </div>
    </DetailBox>
    {#if fromFile.tags !== undefined}
      <p class={fromFileClass}>{fromFile.tags}</p>
    {/if}
  </div>
  <div class={isGrouped ? GROUPED_FIELD : FIELD}>
    <DetailFieldHead
      label={m.edit_details_summary()}
      labelFor="{id}-summary"
      isEdited={edited.summary}
      useFileLabel={useFileLabel("summary")}
      onUseFile={() => {
        useFile("summary");
      }}
    />
    <DetailBox {isGrouped}>
      <Textarea
        id="{id}-summary"
        rows={3}
        value={draft.summary}
        placeholder={details.summary.fromFile ?? undefined}
        oninput={(event: Event & { currentTarget: HTMLTextAreaElement }) => {
          onDraft({ ...draft, summary: event.currentTarget.value });
        }}
        aria-describedby={fromFile.summary === undefined
          ? undefined
          : `${id}-summary-file`}
        class={["text-body", isGrouped && GROUPED_FIELD_BOX]}
      />
    </DetailBox>
    {#if fromFile.summary !== undefined}
      <p id="{id}-summary-file" class={fromFileClass}>{fromFile.summary}</p>
    {/if}
  </div>
  <DetailBox {isGrouped}>
    {#if details.isRatedAdult && countsAgeRatings}
      <LockedAdultMark />
    {:else}
      <SettingSwitch
        label={m.edit_details_mark_adult()}
        description={details.isRatedAdult
          ? m.edit_details_mark_adult_ratings_off()
          : m.edit_details_mark_adult_note()}
        isOn={draft.isMarkedAdult}
        onToggle={() => {
          onDraft({ ...draft, isMarkedAdult: !draft.isMarkedAdult });
        }}
        class="-mx-lg -mbe-xs inline-auto"
      />
    {/if}
  </DetailBox>
</section>
