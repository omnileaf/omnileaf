<script lang="ts">
  import { List, X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ButtonVariant } from "#lib/components/ui/button/looks.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import type { BooksShown } from "#lib/ipc/bindings.ts";
  import type { PhonePlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SERIES_CONTROL } from "./series-control.ts";

  interface PhoneAction {
    readonly variant: ButtonVariant;
    readonly hasIcon: boolean;
  }

  const ICON_SIZE = 18;
  const PHONE_ACTIONS: Readonly<Record<PhonePlatform, PhoneAction>> = {
    ios: { variant: "plain", hasIcon: false },
    android: { variant: "secondary", hasIcon: true },
  };

  let {
    phone: phonePlatform,
    search,
    shown,
    onClearSearch,
    onShowAll,
  }: {
    phone: PhonePlatform | undefined;
    search: string;
    shown: BooksShown;
    onClearSearch: () => void;
    onShowAll: () => void;
  } = $props();

  const phone = $derived(
    phonePlatform === undefined ? undefined : PHONE_ACTIONS[phonePlatform],
  );
  const action = $derived(
    phone === undefined
      ? { look: "outline" as const, class: SERIES_CONTROL }
      : { variant: phone.variant },
  );
  const hasIcon = $derived(phone?.hasIcon !== false);
  const searched = $derived(search.trim());
</script>

<Card
  class={[
    "flex flex-col items-center gap-md px-lg py-xl text-center expanded:p-2xl",
    phone === undefined && "shadow-card-rest",
  ]}
>
  {#if searched !== ""}
    <p class="text-body">{m.series_no_match({ search: searched })}</p>
    <Button type="button" {...action} onclick={onClearSearch}>
      {#if hasIcon}
        <X size={ICON_SIZE} aria-hidden="true" />
      {/if}
      {m.series_clear_search()}
    </Button>
  {:else}
    <p class="text-body">
      {shown === "bookmarked" ? m.series_no_bookmarked() : m.series_no_unread()}
    </p>
    <Button type="button" {...action} onclick={onShowAll}>
      {#if hasIcon}
        <List size={ICON_SIZE} aria-hidden="true" />
      {/if}
      {m.series_show_all_books()}
    </Button>
  {/if}
</Card>
