<script lang="ts">
  import { FileQuestionMark, TriangleAlert } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";
  import {
    type ActionGroupLook,
    actionGroupLook,
  } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import ProblemScreen from "#lib/problems/ProblemScreen.svelte";

  const NOT_FOUND = 404;

  const TODAYS_ACTIONS: ActionGroupLook = {
    group: "contents",
    main: "flex items-center justify-center rounded-control bg-accent px-xl font-bold text-on-accent transition-control min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed desktop:px-lg desktop:text-label desktop:min-block-pointer-button",
    other: "",
  };

  const isMissing = $derived(page.status === NOT_FOUND);
  const width = new WindowWidth();
  const actions = $derived(
    actionGroupLook(currentPlatform(), width.current, TODAYS_ACTIONS),
  );
</script>

{#snippet goToLibrary()}
  <div class={actions.group}>
    <a href={resolve(SECTION_ROUTE_IDS.library)} class={actions.main}>
      {m.problem_go_to_library()}
    </a>
  </div>
{/snippet}

{#if isMissing}
  <ProblemScreen
    icon={FileQuestionMark}
    title={m.problem_page_missing_title()}
    body={m.problem_page_missing_body()}
    detail={page.url.pathname}
    actions={goToLibrary}
  />
{:else}
  <ProblemScreen
    icon={TriangleAlert}
    title={m.problem_page_failed_title()}
    body={m.problem_page_failed_body()}
    actions={goToLibrary}
  />
{/if}
