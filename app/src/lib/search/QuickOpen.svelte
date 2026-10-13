<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { DialogContent } from "#lib/components/ui/dialog/index.ts";
  import {
    commands,
    DEFAULT_LIBRARY_LISTING,
    type LibrarySeries,
    type Platform,
    SEARCH_MAX_CHARS,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { isComposing } from "./composition";
  import { placesMatching } from "./places";
  import { type Choice, choiceKey } from "./quick-open-choice";
  import { quickOpenShortcutLabel } from "./quick-open-shortcut";
  import QuickOpenOption from "./QuickOpenOption.svelte";
  import type { QuickOpenState } from "./quick-open-state.svelte";

  interface Group {
    readonly name: "series" | "places";
    readonly label: string;
    readonly choices: readonly Choice[];
    readonly start: number;
  }

  const SERIES_SHOWN = 6;
  const SEARCH_ICON_SIZE = 20;

  let {
    platform,
    quickOpen,
    usesStandIns,
  }: {
    platform: Platform;
    quickOpen: QuickOpenState;
    usesStandIns: boolean;
  } = $props();

  let text = $state("");
  let answered = $state("");
  let series: readonly LibrarySeries[] = $state([]);
  let active = $state(0);
  let latestSearch = 0;

  const id = $props.id();
  const listboxId = `${id}-results`;
  const nothingFoundId = `${id}-nothing-found`;

  const groups: readonly Group[] = $derived.by(() => {
    const seriesChoices = series.map((one): Choice => ({
      kind: "series",
      series: one,
    }));
    const placeChoices = placesMatching(text, getLocale()).map(
      (place): Choice => ({ kind: "place", place }),
    );
    return [
      {
        name: "series" as const,
        label: m.quick_open_series(),
        choices: seriesChoices,
        start: 0,
      },
      {
        name: "places" as const,
        label: m.quick_open_places(),
        choices: placeChoices,
        start: seriesChoices.length,
      },
    ].filter((group) => group.choices.length > 0);
  });
  const choices = $derived(groups.flatMap((group) => group.choices));
  const isAnswered = $derived(answered === text);

  $effect(() => {
    if (quickOpen.isOpen) {
      untrack(showWithNothingTyped);
    }
  });

  function showWithNothingTyped(): void {
    text = "";
    answered = "";
    series = [];
    active = 0;
    latestSearch += 1;
  }

  async function lookFor(typed: string): Promise<void> {
    text = typed;
    active = 0;
    const search = ++latestSearch;
    if (typed.trim() === "") {
      series = [];
      answered = typed;
      return;
    }
    const page = await commands.librarySearch(null, {
      text: typed,
      filter: DEFAULT_LIBRARY_LISTING.filter,
    });
    if (search !== latestSearch) {
      return;
    }
    if (page.status === "error") {
      reportError(page.error);
    }
    series =
      page.status === "ok" ? page.data.series.slice(0, SERIES_SHOWN) : [];
    answered = typed;
    active = 0;
  }

  function optionId(index: number): string {
    return `${id}-option-${String(index)}`;
  }

  function choose(choice: Choice | undefined): void {
    if (choice === undefined) {
      return;
    }
    quickOpen.close();
    switch (choice.kind) {
      case "series":
        void goto(resolve("/(app)/series/[id]", { id: choice.series.id }));
        return;
      case "place":
        void goto(resolve(choice.place.route));
        return;
    }
  }

  function groupStartFrom(step: 1 | -1): number {
    const current = groups.findLastIndex((group) => group.start <= active);
    const next = (current + step + groups.length) % groups.length;
    return groups[next]?.start ?? 0;
  }

  function moveBy(step: 1 | -1): void {
    active = (active + step + choices.length) % choices.length;
  }

  function keyDown(event: KeyboardEvent): void {
    if (isComposing(event)) {
      event.stopPropagation();
      return;
    }
    if (choices.length === 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        moveBy(1);
        break;
      case "ArrowUp":
        moveBy(-1);
        break;
      case "Tab":
        active = groupStartFrom(event.shiftKey ? -1 : 1);
        break;
      case "Enter":
        if (isAnswered) {
          choose(choices[active]);
        }
        break;
      default:
        return;
    }
    event.preventDefault();
    document
      .getElementById(optionId(active))
      ?.scrollIntoView({ block: "nearest" });
  }

  function type(event: Event & { currentTarget: HTMLInputElement }): void {
    void lookFor(event.currentTarget.value);
  }
</script>

<Dialog.Root
  bind:open={
    () => quickOpen.isOpen,
    (open: boolean) => {
      if (!open) {
        quickOpen.close();
      }
    }
  }
>
  <DialogContent
    aria-label={m.quick_open_title()}
    class="inset-none inset-bs-quick-open-top mx-auto flex flex-col overflow-hidden rounded-dialog border border-border bg-card text-foreground fade-motion shadow-dialog block-fit inline-quick-open max-block-dialog-limit max-inline-full"
  >
    <div
      class="flex items-center gap-label border-be border-border px-lg block-quick-open-field"
    >
      <Search size={SEARCH_ICON_SIZE} aria-hidden="true" class="shrink-0" />
      <input
        type="text"
        role="combobox"
        aria-label={m.quick_open_field()}
        aria-expanded={choices.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-describedby={nothingFoundId}
        aria-activedescendant={choices.length > 0
          ? optionId(active)
          : undefined}
        autocomplete="off"
        spellcheck="false"
        maxlength={SEARCH_MAX_CHARS}
        value={text}
        class="flex-1 bg-transparent text-quick-open outline-none min-inline-none"
        oninput={type}
        onkeydown={keyDown}
      />
      <kbd
        aria-hidden="true"
        class="shrink-0 rounded-badge border border-border bg-chip px-key-inline py-key-block font-ui text-caption font-bold"
      >
        {m.search_escape_key()}
      </kbd>
    </div>
    <div
      id={listboxId}
      role="listbox"
      aria-label={m.quick_open_results()}
      class={[
        "flex flex-col gap-2xs overflow-y-auto max-block-quick-open-results",
        choices.length > 0 && "p-sm",
      ]}
    >
      {#each groups as group (group.name)}
        {@const headingId = `${id}-${group.name}`}
        <div
          role="group"
          aria-labelledby={headingId}
          class="flex flex-col gap-2xs"
        >
          <div
            id={headingId}
            class="px-option-inline pbs-group-label-top pbe-xs text-overline font-bold tracking-overline text-muted uppercase"
          >
            {group.label}
          </div>
          {#each group.choices as choice, offset (choiceKey(choice))}
            {@const index = group.start + offset}
            <QuickOpenOption
              id={optionId(index)}
              {choice}
              isActive={index === active}
              {usesStandIns}
              onActivate={() => {
                active = index;
              }}
              onChoose={() => {
                choose(choice);
              }}
              onKeyDown={keyDown}
            />
          {/each}
        </div>
      {/each}
    </div>
    <p
      id={nothingFoundId}
      role="status"
      class={[
        "text-small text-muted",
        choices.length === 0 && "m-sm px-option-inline py-sm",
      ]}
    >
      {#if choices.length === 0 && isAnswered}
        {m.search_nothing_called({ text: text.trim() })}
      {/if}
    </p>
    <footer
      class="flex items-center gap-lg border-bs border-border px-lg text-caption text-muted block-key-hints"
    >
      <span>{m.search_key_move()}</span>
      <span>{m.search_key_open()}</span>
      <span>{m.search_key_next_group()}</span>
      <span class="ms-auto">
        {m.quick_open_anywhere({ shortcut: quickOpenShortcutLabel(platform) })}
      </span>
    </footer>
  </DialogContent>
</Dialog.Root>
