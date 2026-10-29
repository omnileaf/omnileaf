<script lang="ts">
  import { ArrowDownUp, Search } from "@lucide/svelte";

  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ButtonVariant } from "#lib/components/ui/button/looks.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import {
    ToggleGroup,
    ToggleGroupItem,
  } from "#lib/components/ui/toggle-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    BooksShown,
    SeriesBookListing,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { currentPlatform, type PhonePlatform } from "#lib/page/platform.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";

  interface PhoneTools {
    readonly variant: ButtonVariant;
    readonly foldsShownWhenCrowded: boolean;
  }

  const SHOWN_OPTIONS: readonly BooksShown[] = ["all", "unread", "bookmarked"];
  const SHOWN_LABELS = {
    all: m.series_show_all,
    unread: m.series_show_unread,
    bookmarked: m.series_show_bookmarked,
  } satisfies Record<BooksShown, () => string>;
  const PHONE_TOOLS: Readonly<Record<PhonePlatform, PhoneTools>> = {
    ios: { variant: "secondary", foldsShownWhenCrowded: true },
    android: { variant: "plain", foldsShownWhenCrowded: false },
  };
  const ORDERS = [
    { direction: "ascending", label: m.series_order_first_first },
    { direction: "descending", label: m.series_order_last_first },
  ] as const satisfies readonly {
    direction: SortDirection;
    label: () => string;
  }[];
  const ICON_SIZE = 16;

  const isMacos = currentPlatform() === "macos";
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const showLabelId = $props.id();
  let isSearching = $state(false);
  let searchField = $state<HTMLInputElement | null>(null);

  async function reveal(): Promise<void> {
    isSearching = !isSearching;
    await tick();
    if (isSearching) {
      searchField?.focus();
    }
  }

  let {
    phone: phonePlatform,
    listing,
    onChoose,
    search,
    onSearch,
    onShownCrowded,
  }: {
    phone: PhonePlatform | undefined;
    listing: SeriesBookListing;
    onChoose: (listing: SeriesBookListing) => void;
    search: string;
    onSearch: (search: string) => void;
    onShownCrowded: (isCrowded: boolean) => void;
  } = $props();

  const phone = $derived(
    phonePlatform === undefined ? undefined : PHONE_TOOLS[phonePlatform],
  );

  const order = $derived(
    listing.direction === "descending"
      ? m.series_order_last_first()
      : m.series_order_first_first(),
  );

  function isShown(value: string): value is BooksShown {
    return SHOWN_OPTIONS.some((shown) => shown === value);
  }

  function chooseShown(chosen: string): void {
    if (isShown(chosen)) {
      onChoose({ ...listing, shown: chosen });
    }
  }

  function chooseDirection(chosen: string): void {
    if (isDirection(chosen)) {
      onChoose({ ...listing, direction: chosen });
    }
  }

  function isDirection(value: string): value is SortDirection {
    return ORDERS.some(({ direction }) => direction === value);
  }
</script>

{#snippet shownPopUp()}
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button {...props} variant="secondary" class="max-inline-full">
          <span class="truncate min-inline-none">
            {m.series_show_choice({ shown: SHOWN_LABELS[listing.shown]() })}
          </span>
          <Icon name="chevrons-up-down" class="shrink-0" />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent to="main" align="start" class="min-inline-book-menu">
      <DropdownMenuRadioGroup value={listing.shown} onValueChange={chooseShown}>
        {#each SHOWN_OPTIONS as shown (shown)}
          <DropdownMenuRadioItem value={shown}>
            {SHOWN_LABELS[shown]()}
          </DropdownMenuRadioItem>
        {/each}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
{/snippet}

<div class="flex flex-wrap items-center gap-sm">
  <InputGroup
    class={[
      "gap-sm rounded-shadcn-control border border-border bg-background px-md text-muted shadow-raised block-pointer-button inline-series-search focus-within:border-accent max-expanded:order-last max-expanded:block-touch-target max-expanded:inline-full",
      !isSearching && "max-expanded:hidden",
    ]}
  >
    <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
    <Input
      bind:ref={searchField}
      type="search"
      aria-label={m.series_find_book()}
      placeholder={m.series_find_book()}
      value={search}
      class="text-small text-foreground max-expanded:text-body"
      oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
        onSearch(event.currentTarget.value);
      }}
    />
  </InputGroup>
  {#if phone !== undefined}
    <span id={showLabelId} class="sr-only">{m.series_show()}</span>
    <div class="relative flex-1 min-inline-none">
      <SegmentedControl
        options={SHOWN_OPTIONS}
        labels={SHOWN_LABELS}
        chosen={listing.shown}
        labelledBy={showLabelId}
        size="small"
        isFullWidth
        segmentClass="min-inline-native-target"
        onChoose={chooseShown}
        crowded={phone.foldsShownWhenCrowded ? shownPopUp : undefined}
        onFit={(fitsOneRow: boolean) => {
          onShownCrowded(!fitsOneRow);
        }}
      />
    </div>
    <Button
      type="button"
      variant={phone.variant}
      iconOnly
      label={m.series_find_book()}
      aria-expanded={isSearching}
      class="shrink-0"
      onclick={() => {
        void reveal();
      }}
    >
      <Icon name="search" />
    </Button>
  {:else if isMacos}
    <div class="flex items-center gap-sm max-expanded:flex-1">
      <span id={showLabelId} class="text-small text-muted">
        {m.series_show()}
      </span>
      <SegmentedControl
        options={SHOWN_OPTIONS}
        labels={SHOWN_LABELS}
        chosen={listing.shown}
        labelledBy={showLabelId}
        onChoose={chooseShown}
      />
    </div>
    {#if !isWide.current}
      <Button
        type="button"
        variant="secondary"
        iconOnly
        label={m.series_find_book()}
        aria-expanded={isSearching}
        class="shrink-0"
        onclick={() => {
          void reveal();
        }}
      >
        <Icon name="search" />
      </Button>
    {/if}
  {:else}
    <ToggleGroup
      aria-label={m.series_show()}
      class="max-expanded:flex-1"
      bind:value={() => listing.shown, chooseShown}
    >
      {#each SHOWN_OPTIONS as shown (shown)}
        <ToggleGroupItem
          value={shown}
          data-label={SHOWN_LABELS[shown]()}
          class="max-expanded:grow"
        >
          {SHOWN_LABELS[shown]()}
        </ToggleGroupItem>
      {/each}
    </ToggleGroup>
    {#if !isWide.current}
      <Tooltip
        label={m.series_find_book()}
        type="button"
        aria-label={m.series_find_book()}
        aria-expanded={isSearching}
        onclick={() => {
          void reveal();
        }}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            look="outline"
            class="flex shrink-0 items-center justify-center rounded-shadcn-button font-medium shadow-raised block-touch-target inline-touch-target"
          >
            <Search size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    {/if}
  {/if}
  <DropdownMenu>
    {#if phone !== undefined}
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant={phone.variant}
            iconOnly
            label={m.series_sort({ order })}
            class="shrink-0"
          >
            <Icon name="arrow-down-up" />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
    {:else if isMacos}
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          {#if isWide.current}
            <Button
              {...props}
              variant="secondary"
              aria-label={m.series_sort({ order })}
              class="ms-auto"
            >
              <Icon name="arrow-down-up" />
              <span class="grid">
                {#each ORDERS as { direction, label } (direction)}
                  <span
                    class={[
                      "col-start-1 row-start-1",
                      listing.direction !== direction && "invisible",
                    ]}
                  >
                    {m.series_sort({ order: label() })}
                  </span>
                {/each}
              </span>
              <Icon name="chevron-down" class="shrink-0" />
            </Button>
          {:else}
            <Button
              {...props}
              variant="secondary"
              iconOnly
              label={m.series_sort({ order })}
              class="shrink-0"
            >
              <Icon name="arrow-down-up" />
            </Button>
          {/if}
        {/snippet}
      </DropdownMenuTrigger>
    {:else}
      <Tooltip label={isWide.current ? undefined : m.series_sort({ order })}>
        {#snippet child({ props: tip })}
          <DropdownMenuTrigger {...tip}>
            {#snippet child({ props })}
              <Button
                {...props}
                look="outline"
                aria-label={m.series_sort({ order })}
                class="flex shrink-0 items-center justify-center gap-sm rounded-shadcn-button font-medium block-touch-target max-expanded:shadow-raised max-expanded:inline-touch-target expanded:ms-auto expanded:rounded-shadcn-button expanded:border-transparent expanded:bg-transparent expanded:px-md expanded:text-small expanded:font-medium expanded:block-pointer-button expanded:hover:bg-hover"
              >
                <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
                <span class="grid max-expanded:hidden">
                  {#each ORDERS as { direction, label } (direction)}
                    <span
                      class={[
                        "col-start-1 row-start-1",
                        listing.direction !== direction && "invisible",
                      ]}
                    >
                      {m.series_sort({ order: label() })}
                    </span>
                  {/each}
                </span>
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
        {/snippet}
      </Tooltip>
    {/if}
    <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
      <DropdownMenuRadioGroup
        value={listing.direction}
        onValueChange={chooseDirection}
      >
        {#each ORDERS as { direction, label } (direction)}
          <DropdownMenuRadioItem value={direction}>
            {label()}
          </DropdownMenuRadioItem>
        {/each}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
