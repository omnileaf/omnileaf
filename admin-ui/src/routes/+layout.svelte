<script lang="ts">
  import "../app.css";

  import type { Snippet } from "svelte";

  import { afterNavigate, refreshAll } from "$app/navigation";
  import { page } from "$app/state";

  import AppShell from "#lib/components/app-shell.svelte";
  import SessionProblem from "#lib/components/session-problem.svelte";
  import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";
  import { api, goToSignIn } from "#lib/browser-api.ts";
  import { loadWhenSignedIn } from "#lib/load-reports.ts";
  import { movesFocusToHeading } from "#lib/navigation.ts";
  import { refreshAndFocus } from "#lib/refresh-and-focus.ts";
  import { provideReports, ReportsStore } from "#lib/reports-store.svelte.ts";
  import { SignOutControl } from "#lib/sign-out-control.svelte.ts";

  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  const reports = new ReportsStore(api);
  provideReports(reports);
  const signOut = new SignOutControl(api, goToSignIn);

  $effect(() => {
    loadWhenSignedIn(data.session, reports);
  });

  afterNavigate(({ type }) => {
    signOut.clear();
    if (movesFocusToHeading(type)) {
      focusPageHeadingInDocument();
    }
  });
</script>

{#if data.session.ok}
  {@const csrf = data.session.value.csrf}
  <AppShell
    login={data.session.value.login}
    pathname={page.url.pathname}
    signOut={signOut.state}
    onSignOut={() => {
      void signOut.run(csrf);
    }}
  >
    {@render children()}
  </AppShell>
{:else}
  <SessionProblem
    error={data.session.error}
    onRetry={() => {
      void refreshAndFocus(refreshAll, focusPageHeadingInDocument);
    }}
  />
{/if}
