<script lang="ts">
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Leaf from "@lucide/svelte/icons/leaf";
  import LogOut from "@lucide/svelte/icons/log-out";
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";

  import { cn } from "#lib/cn.ts";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import { navSection, type NavSection } from "#lib/navigation.ts";
  import type { SignOutState } from "#lib/sign-out-control.svelte.ts";

  let {
    login,
    pathname,
    signOut,
    onSignOut,
    children,
  }: {
    login: string;
    pathname: string;
    signOut: SignOutState;
    onSignOut: () => void;
    children: Snippet;
  } = $props();

  const NAV_LINK =
    "inline-flex flex-1 items-center justify-center rounded-control px-3 text-small font-medium block-11 tablet:flex-none tablet:block-9";
  const NAV_LINK_IDLE = "text-muted hover:text-foreground";
  const NAV_LINK_CURRENT = "bg-chip font-semibold text-foreground";

  const links = $derived([
    {
      section: "dashboard",
      label: copy.shell.dashboard,
      href: resolve("/"),
    },
    {
      section: "reports",
      label: copy.shell.reports,
      href: resolve("/reports"),
    },
  ] satisfies { section: NavSection; label: string; href: string }[]);
  const current = $derived(navSection(pathname));
</script>

<a
  href="#main"
  class={cn(
    "sr-only focus:not-sr-only focus:fixed focus:inset-s-4 focus:inset-bs-4 focus:z-10 focus:inline-flex focus:items-center focus:rounded-control focus:bg-card focus:px-4 focus:text-small focus:font-semibold focus:block-11 tablet:focus:block-9",
    FOCUS_RING,
  )}
>
  {copy.shell.skipLink}
</a>

<header class="border-be border-border bg-card">
  <div
    class="flex flex-wrap items-center gap-x-2 gap-y-2.5 px-4 py-3 tablet:flex-nowrap tablet:px-6 tablet:py-0 tablet:block-16"
  >
    <a
      href={resolve("/")}
      class={cn(
        "flex items-center gap-2.5 rounded-control text-body font-semibold block-11 tablet:me-4 tablet:block-9",
        FOCUS_RING,
      )}
    >
      <span
        class="flex items-center justify-center rounded-control bg-accent text-on-accent block-7 inline-7"
      >
        <Leaf class="block-4 inline-4" />
      </span>
      {copy.appName}
    </a>
    <nav
      aria-label={copy.shell.mainNav}
      class="order-last flex gap-1 inline-full tablet:order-0 tablet:inline-auto"
    >
      {#each links as link (link.section)}
        <a
          href={link.href}
          aria-current={link.section === current ? "page" : undefined}
          class={cn(
            NAV_LINK,
            link.section === current ? NAV_LINK_CURRENT : NAV_LINK_IDLE,
            FOCUS_RING,
          )}
        >
          {link.label}
        </a>
      {/each}
    </nav>
    <div class="ms-auto flex items-center gap-3 text-small text-muted">
      <span class="sr-only tablet:not-sr-only">
        {copy.shell.signedInAs}
        <strong class="font-semibold text-foreground">{login}</strong>
      </span>
      <Button
        variant="ghost"
        disabled={signOut.kind === "pending"}
        onclick={onSignOut}
      >
        <LogOut class="block-4 inline-4" />
        {copy.shell.signOut}
      </Button>
    </div>
  </div>
</header>

<main
  id="main"
  tabindex="-1"
  class="mx-auto px-4 pbs-5 pbe-7 inline-full max-inline-page focus:outline-none tablet:px-6 tablet:pbs-8 tablet:pbe-10"
>
  {#if signOut.kind === "failed"}
    <Alert icon={CircleAlert} class="mbe-4">
      <AlertTitle>{copy.shell.signOutFailed}</AlertTitle>
      <AlertDescription>{signOut.message}</AlertDescription>
    </Alert>
  {/if}
  {@render children()}
</main>
