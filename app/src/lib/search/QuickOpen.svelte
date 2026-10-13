<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { Command, Dialog } from "bits-ui";
  import { untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { DialogContent } from "#lib/components/ui/dialog/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
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
  let selectedKey = $state("");
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
  const active = $derived(
    Math.max(
      0,
      choices.findIndex((choice) => choiceKey(choice) === selectedKey),
    ),
  );

  $effect(() => {
    if (quickOpen.isOpen) {
      untrack(showWithNothingTyped);
    }
  });

  function showWithNothingTyped(): void {
    text = "";
    answered = "";
    series = [];
    selectFirstChoice();
    latestSearch += 1;
  }

  async function lookFor(typed: string): Promise<void> {
    text = typed;
    selectedKey = "";
    const search = ++latestSearch;
    if (typed.trim() === "") {
      series = [];
      answered = typed;
      selectFirstChoice();
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
    selectFirstChoice();
  }

  function optionId(choice: Choice): string {
    return `${id}-option-${choiceKey(choice)}`;
  }

  function activeDescendant(props: unknown): string | undefined {
    if (typeof props !== "object" || props === null) {
      return undefined;
    }
    const value = (props as Record<string, unknown>)["aria-activedescendant"];
    return typeof value === "string" ? value : undefined;
  }

  function selectFirstChoice(): void {
    selectedKey = choices[0] === undefined ? "" : choiceKey(choices[0]);
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

  function keyDownInInput(event: KeyboardEvent): void {
    if (isComposing(event)) {
      event.stopPropagation();
      return;
    }
    switch (event.key) {
      case "Tab": {
        if (choices.length === 0) {
          return;
        }
        const nextChoice = choices[groupStartFrom(event.shiftKey ? -1 : 1)];
        if (nextChoice === undefined) {
          return;
        }
        selectedKey = choiceKey(nextChoice);
        event.preventDefault();
        event.stopPropagation();
        break;
      }
      case "Enter":
        if (!isAnswered) {
          event.preventDefault();
          event.stopPropagation();
        }
        break;
      case "Home":
      case "End":
        event.stopPropagation();
        break;
      default:
        return;
    }
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
    <Command.Root
      label={m.quick_open_title()}
      shouldFilter={false}
      loop
      vimBindings={false}
      bind:value={selectedKey}
      class="flex flex-col min-block-none"
    >
      <div
        class="flex items-center gap-label border-be border-border px-lg block-quick-open-field"
      >
        <Search size={SEARCH_ICON_SIZE} aria-hidden="true" class="shrink-0" />
        <Command.Input value={text} maxlength={SEARCH_MAX_CHARS} autofocus>
          {#snippet child({ props })}
            <input
              {...props}
              aria-label={m.quick_open_field()}
              aria-labelledby={undefined}
              aria-expanded={choices.length > 0}
              aria-controls={listboxId}
              aria-describedby={nothingFoundId}
              aria-activedescendant={choices.length > 0
                ? activeDescendant(props)
                : undefined}
              maxlength={SEARCH_MAX_CHARS}
              value={text}
              class="flex-1 bg-transparent text-quick-open outline-none min-inline-none"
              oninput={type}
              onkeydown={keyDownInInput}
            />
          {/snippet}
        </Command.Input>
        <Kbd aria-hidden="true">{m.search_escape_key()}</Kbd>
      </div>
      <Command.List
        id={listboxId}
        aria-label={m.quick_open_results()}
        class={[
          "overflow-y-auto max-block-quick-open-results",
          choices.length > 0 && "p-sm",
        ]}
      >
        <Command.Viewport class="flex flex-col gap-2xs">
          {#each groups as group (group.name)}
            {@const headingId = `${id}-${group.name}`}
            <Command.Group value={group.name}>
              <Command.GroupHeading
                id={headingId}
                class="px-option-inline pbs-group-label-top pbe-xs text-overline font-bold tracking-overline text-muted uppercase"
              >
                {group.label}
              </Command.GroupHeading>
              <Command.GroupItems class="flex flex-col gap-2xs">
                {#each group.choices as choice (choiceKey(choice))}
                  <QuickOpenOption
                    id={optionId(choice)}
                    {choice}
                    isActive={choiceKey(choice) === selectedKey}
                    {usesStandIns}
                    onChoose={() => {
                      choose(choice);
                    }}
                  />
                {/each}
              </Command.GroupItems>
            </Command.Group>
          {/each}
        </Command.Viewport>
      </Command.List>
    </Command.Root>
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
