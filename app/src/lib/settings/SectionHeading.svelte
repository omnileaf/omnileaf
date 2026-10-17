<script lang="ts">
  import { ArrowLeft, ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { isListedBeside, type ParentPage } from "./sections";

  let {
    title,
    parent = { route: "/(app)/settings", title: m.settings_title() },
  }: { title: string; parent?: ParentPage } = $props();

  const ARROW_SIZE = 24;
  const PHONE_CHEVRON_SIZE = 22;
  const POINTER_CHEVRON_SIZE = 16;

  const SETTINGS_ROUTE = "/(app)/settings";
  const CRUMB_LINK =
    "block truncate text-muted transition-control min-inline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent";

  const backLabel = $derived(m.back_to({ page: parent.title }));
  const isNested = $derived(parent.route !== SETTINGS_ROUTE);
</script>

<div
  class="hidden items-center gap-sm border-be border-border desktop:two-pane:-mx-pane desktop:two-pane:-mbs-page-top desktop:two-pane:mbe-xl desktop:two-pane:flex desktop:two-pane:px-pane desktop:two-pane:min-block-toolbar"
>
  {#if isNested}
    <Tooltip label={backLabel}>
      {#snippet child({ props })}
        <a
          {...props}
          href={resolve(parent.route)}
          aria-label={backLabel}
          class="flex shrink-0 items-center justify-center rounded-shadcn-control text-muted transition-control block-reader-dense inline-reader-dense hover:bg-hover hover:text-foreground active:bg-pressed"
        >
          <ArrowLeft size={POINTER_CHEVRON_SIZE} class="rtl:-scale-x-100" />
        </a>
      {/snippet}
    </Tooltip>
  {/if}
  <Breadcrumb aria-label={m.settings_breadcrumb()} class="text-small">
    <BreadcrumbItem>
      <a href={resolve(SETTINGS_ROUTE)} class={CRUMB_LINK}
        >{m.settings_title()}</a
      >
    </BreadcrumbItem>
    <BreadcrumbSeparator class="text-muted" />
    {#if isNested}
      <BreadcrumbItem>
        <a href={resolve(parent.route)} class={CRUMB_LINK}>{parent.title}</a>
      </BreadcrumbItem>
      <BreadcrumbSeparator class="text-muted" />
    {/if}
    <BreadcrumbItem class="min-inline-none">
      <BreadcrumbPage>{title}</BreadcrumbPage>
    </BreadcrumbItem>
  </Breadcrumb>
</div>

<header
  class="flex flex-col items-start android:max-medium:-ms-md android:max-medium:flex-row android:max-medium:items-center android:max-medium:gap-xs touch:max-medium:-mbs-sm touch:medium:max-expanded:-mbs-lg desktop:max-medium:-mbs-md"
>
  <Tooltip label={backLabel}>
    {#snippet child({ props })}
      <a
        {...props}
        href={resolve(parent.route)}
        data-back-link
        aria-label={backLabel}
        class={[
          "flex shrink-0 items-center gap-2xs transition-control hover:bg-hover active:bg-pressed",
          isListedBeside(parent.route) && "two-pane:hidden",
          "desktop:two-pane:hidden",
          "desktop:-ms-xs desktop:rounded-row desktop:ps-2xs desktop:pe-sm desktop:text-label desktop:font-semibold desktop:text-accent desktop:block-2xl",
          "ios:max-medium:-ms-xs ios:max-medium:rounded-row ios:max-medium:px-sm ios:max-medium:text-back-link ios:max-medium:font-medium ios:max-medium:text-accent ios:max-medium:min-block-touch-target",
          "android:justify-center android:rounded-full android:block-touch-target android:inline-touch-target",
          "ios:medium:justify-center ios:medium:rounded-full ios:medium:block-touch-target ios:medium:inline-touch-target",
          "touch:medium:-ms-md",
        ]}
      >
        <ArrowLeft
          size={ARROW_SIZE}
          class="hidden rtl:-scale-x-100 ios:medium:block android:block"
        />
        <ChevronLeft
          size={PHONE_CHEVRON_SIZE}
          class="hidden rtl:-scale-x-100 ios:max-medium:block"
        />
        <ChevronLeft
          size={POINTER_CHEVRON_SIZE}
          class="hidden rtl:-scale-x-100 desktop:block"
        />
        <span class="ios:medium:hidden android:hidden">{parent.title}</span>
      </a>
    {/snippet}
  </Tooltip>
  <h1
    tabindex="-1"
    class={[
      "mbs-xs text-bar-title font-bold tracking-tight wrap-anywhere two-pane:mbs-none",
      "android:max-medium:mbs-none android:max-medium:font-semibold android:max-medium:tracking-normal",
      "ios:max-medium:ps-xs ios:max-medium:text-page-title",
      "touch:medium:max-expanded:text-page-title",
    ]}
  >
    {title}
  </h1>
</header>
