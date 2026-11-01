<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import {
    GROUPED_FOOTNOTE,
    GROUPED_FOOTNOTE_TYPE,
  } from "#lib/library/group-look.ts";
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
  import AdultMarkCheckbox from "./AdultMarkCheckbox.svelte";
  import {
    ANDROID_CHIP_CROSS_SIZE,
    ANDROID_DETAIL_CHIP,
    DETAIL_CHIP,
    GROUPED_DETAIL_CHIP,
    MACOS_CHIP_CROSS,
    MACOS_CHIP_CROSS_SIZE,
    MACOS_DETAIL_CHIP,
  } from "./detail-chip.ts";
  import {
    MACOS_DETAIL_NOTE,
    MACOS_ONE_LINE_FIELD,
    MACOS_TALL_FIELD,
  } from "./detail-field.ts";
  import DetailBox from "./DetailBox.svelte";
  import DetailFieldHead from "./DetailFieldHead.svelte";
  import LockedAdultMark from "./LockedAdultMark.svelte";
  import SheetSwitchRow from "./SheetSwitchRow.svelte";
  import {
    SHEET_CHIP_ROW,
    SHEET_FIELD_CARD,
    SHEET_LIST_CARD,
    SHEET_SUMMARY_TEXT,
    SHEET_SWITCH_CARD,
    SHEET_TITLE_TEXT,
  } from "./sheet-field-look.ts";

  const PEOPLE_SHOWN_FIRST = 8;
  const ICON_SIZE = 16;
  const FIELD = "flex flex-col gap-sm py-md";
  const GROUPED_FIELD = "flex flex-col gap-sm";
  const MACOS_FIELD = "grid grid-cols-detail-row items-start gap-x-sm gap-y-xs";
  const MACOS_FROM_FILE = `col-start-2 ${MACOS_DETAIL_NOTE}`;
  const MACOS_CHIPS = "col-start-2 flex flex-wrap gap-native-detail-chip-gap";
  const MACOS_ADULT_ROW = "grid grid-cols-detail-row gap-x-sm";
  const CHIPS = "flex flex-wrap items-center gap-sm";
  const FROM_FILE = "text-label text-foreground/80";
  const GROUPED_FIELD_BOX = "border-0 bg-transparent p-none";
  const ANDROID_FROM_FILE = "ps-lg text-caption text-muted";
  const ANDROID_OUTLINED_BOX =
    "rounded-native-outlined-field border border-native-button-outline-edge bg-transparent px-lg pbs-lg shadow-none";
  const FLOATING_LABEL =
    "absolute inset-bs-0 ms-md -translate-y-1/2 bg-background px-xs text-caption text-muted";

  let {
    details,
    countsAgeRatings,
    draft,
    isGrouped = false,
    isAndroid = false,
    isSheet = false,
    isMacos = false,
    onDraft,
    offerUndo,
  }: {
    details: SeriesDetails;
    countsAgeRatings: boolean;
    draft: DetailDraft;
    isGrouped?: boolean;
    isAndroid?: boolean;
    isSheet?: boolean;
    isMacos?: boolean;
    onDraft: (draft: DetailDraft) => void;
    offerUndo: (offer: UndoOffer) => void;
  } = $props();

  const id = $props.id();
  const fromFileClass = $derived(
    isSheet
      ? GROUPED_FOOTNOTE
      : isGrouped
        ? ["ps-lg", GROUPED_FOOTNOTE_TYPE]
        : isAndroid
          ? ANDROID_FROM_FILE
          : isMacos
            ? MACOS_FROM_FILE
            : FROM_FILE,
  );
  const fieldClass = $derived(
    isSheet
      ? "flex flex-col"
      : isMacos
        ? MACOS_FIELD
        : isGrouped || isAndroid
          ? GROUPED_FIELD
          : FIELD,
  );
  const fieldCardClass = $derived(isSheet ? SHEET_FIELD_CARD : undefined);
  const listCardClass = $derived(isSheet ? SHEET_LIST_CARD : undefined);
  const switchCardClass = $derived(isSheet ? SHEET_SWITCH_CARD : undefined);
  const titleTextClass = $derived(
    isSheet ? SHEET_TITLE_TEXT : isGrouped && GROUPED_FIELD_BOX,
  );
  const summaryTextClass = $derived(
    isSheet ? SHEET_SUMMARY_TEXT : isGrouped && GROUPED_FIELD_BOX,
  );
  const sectionClass = $derived(
    isGrouped || isAndroid
      ? "flex flex-col gap-xl"
      : isMacos
        ? "flex flex-col gap-md"
        : "flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card px-lg py-xs",
  );
  const chipExtras = $derived(
    cn(
      isGrouped && GROUPED_DETAIL_CHIP,
      isAndroid && ANDROID_DETAIL_CHIP,
      isMacos && MACOS_DETAIL_CHIP,
    ),
  );
  const chipsClass = $derived(
    isSheet ? SHEET_CHIP_ROW : isMacos ? MACOS_CHIPS : CHIPS,
  );
  const crossSize = $derived(
    isAndroid
      ? ANDROID_CHIP_CROSS_SIZE
      : isMacos
        ? MACOS_CHIP_CROSS_SIZE
        : ICON_SIZE,
  );
  const crossClass = $derived(isMacos ? MACOS_CHIP_CROSS : undefined);
  const adultMark: Snippet = markAdult;
  const isAdultLocked = $derived(details.isRatedAdult && countsAgeRatings);
  const adultNote = $derived(
    !details.isRatedAdult
      ? m.edit_details_mark_adult_note()
      : isMacos
        ? m.edit_details_mark_adult_ratings_off_box()
        : m.edit_details_mark_adult_ratings_off(),
  );
  const setAdult = (isMarkedAdult: boolean): void => {
    onDraft({ ...draft, isMarkedAdult });
  };
  const toggleAdult = (): void => {
    setAdult(!draft.isMarkedAdult);
  };
  const adder: Snippet<[string, (name: string) => void]> = addDetail;
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

  function addPerson(name: string): void {
    onDraft({ ...draft, people: [...draft.people, { name, role: null }] });
  }

  function addTag(tag: string): void {
    if (!draft.tags.includes(tag)) {
      onDraft({ ...draft, tags: [...draft.tags, tag] });
    }
  }

  function removeTag(tag: string): void {
    onDraft({ ...draft, tags: draft.tags.filter((kept) => kept !== tag) });
  }
</script>

{#snippet addDetail(label: string, onAdd: (name: string) => void)}
  <AddDetailChip {isGrouped} {isAndroid} {isMacos} {isSheet} {label} {onAdd} />
{/snippet}

{#snippet markAdult()}
  {#if isAdultLocked}
    <LockedAdultMark {isSheet} />
  {:else if isSheet}
    <SheetSwitchRow
      label={m.edit_details_mark_adult()}
      description={adultNote}
      isOn={draft.isMarkedAdult}
      onToggle={toggleAdult}
    />
  {:else}
    <SettingSwitch
      label={m.edit_details_mark_adult()}
      description={adultNote}
      isOn={draft.isMarkedAdult}
      onToggle={toggleAdult}
      class="-mx-lg -mbe-xs inline-auto"
    />
  {/if}
{/snippet}

<section class={sectionClass}>
  <div class={fieldClass}>
    <DetailFieldHead
      label={m.edit_details_title()}
      labelFor="{id}-title"
      isEdited={edited.title}
      {isAndroid}
      {isSheet}
      {isMacos}
      useFileLabel={useFileLabel("title")}
      onUseFile={() => {
        useFile("title");
      }}
    />
    <DetailBox {isGrouped} isRelative={isAndroid} cardClass={fieldCardClass}>
      {#if isAndroid}
        <label for="{id}-title" class={FLOATING_LABEL}>
          {m.edit_details_title()}
        </label>
      {/if}
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
          !isSheet &&
            (isMacos
              ? MACOS_ONE_LINE_FIELD
              : "text-body min-block-title-field touch:min-block-touch-target"),
          titleTextClass,
          isAndroid && ANDROID_OUTLINED_BOX,
        ]}
      />
    </DetailBox>
    <p id="{id}-title-file" class={fromFileClass}>{fromFile.title}</p>
  </div>
  <div class={fieldClass}>
    <DetailFieldHead
      label={m.edit_details_people()}
      labelId="{id}-people"
      isEdited={edited.people}
      {isAndroid}
      {isSheet}
      {isMacos}
      useFileLabel={useFileLabel("people")}
      onUseFile={() => {
        useFile("people");
      }}
    />
    <DetailBox {isGrouped} cardClass={listCardClass}>
      {#if !isSheet || peopleShown.length > 0}
        <div role="group" aria-labelledby="{id}-people" class={chipsClass}>
          {#each peopleShown as person, index (`${String(index)}·${person.name}`)}
            <button
              type="button"
              aria-label={removePersonLabel(person)}
              class={cn(DETAIL_CHIP, "pe-sm", chipExtras)}
              onclick={() => {
                removePerson(index);
              }}
            >
              {personLabel(person)}
              <X size={crossSize} class={crossClass} aria-hidden="true" />
            </button>
          {/each}
          {#if peopleShown.length < draft.people.length}
            <button
              type="button"
              class={cn(DETAIL_CHIP, "pe-md", chipExtras)}
              onclick={() => {
                isShowingEveryone = true;
              }}
            >
              {m.edit_details_show_all({ count: draft.people.length })}
            </button>
          {/if}
          {#if !isSheet}
            {@render adder(m.edit_details_add_person(), addPerson)}
          {/if}
        </div>
      {/if}
      {#if isSheet}
        {@render adder(m.edit_details_add_person(), addPerson)}
      {/if}
    </DetailBox>
    {#if fromFile.people !== undefined}
      <p class={fromFileClass}>{fromFile.people}</p>
    {/if}
  </div>
  <div class={fieldClass}>
    <DetailFieldHead
      label={m.edit_details_tags()}
      labelId="{id}-tags"
      isEdited={edited.tags}
      {isAndroid}
      {isSheet}
      {isMacos}
      useFileLabel={useFileLabel("tags")}
      onUseFile={() => {
        useFile("tags");
      }}
    />
    <DetailBox {isGrouped} cardClass={listCardClass}>
      {#if !isSheet || draft.tags.length > 0}
        <div role="group" aria-labelledby="{id}-tags" class={chipsClass}>
          {#each draft.tags as tag (tag)}
            <button
              type="button"
              aria-label={m.edit_details_remove_named({ name: tag })}
              class={cn(DETAIL_CHIP, "pe-sm", chipExtras)}
              onclick={() => {
                removeTag(tag);
              }}
            >
              {tag}
              <X size={crossSize} class={crossClass} aria-hidden="true" />
            </button>
          {/each}
          {#if !isSheet}
            {@render adder(m.edit_details_add_tag(), addTag)}
          {/if}
        </div>
      {/if}
      {#if isSheet}
        {@render adder(m.edit_details_add_tag(), addTag)}
      {/if}
    </DetailBox>
    {#if fromFile.tags !== undefined}
      <p class={fromFileClass}>{fromFile.tags}</p>
    {/if}
  </div>
  <div class={fieldClass}>
    <DetailFieldHead
      label={m.edit_details_summary()}
      labelFor="{id}-summary"
      isEdited={edited.summary}
      {isAndroid}
      {isSheet}
      {isMacos}
      isTallField
      useFileLabel={useFileLabel("summary")}
      onUseFile={() => {
        useFile("summary");
      }}
    />
    <DetailBox {isGrouped} isRelative={isAndroid} cardClass={fieldCardClass}>
      {#if isAndroid}
        <label for="{id}-summary" class={FLOATING_LABEL}>
          {m.edit_details_summary()}
        </label>
      {/if}
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
        class={[
          !isSheet && (isMacos ? MACOS_TALL_FIELD : "text-body"),
          summaryTextClass,
          isAndroid && ANDROID_OUTLINED_BOX,
        ]}
      />
    </DetailBox>
    {#if fromFile.summary !== undefined}
      <p id="{id}-summary-file" class={fromFileClass}>{fromFile.summary}</p>
    {/if}
  </div>
  {#if isMacos}
    <div class={MACOS_ADULT_ROW}>
      <AdultMarkCheckbox
        isOn={isAdultLocked || draft.isMarkedAdult}
        isLocked={isAdultLocked}
        note={adultNote}
        onChange={setAdult}
      />
    </div>
  {:else}
    <DetailBox {isGrouped} cardClass={switchCardClass}>
      {@render adultMark()}
    </DetailBox>
  {/if}
</section>
