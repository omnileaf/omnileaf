<script lang="ts">
  import { FileQuestionMark, TriangleAlert } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages.js";
  import ProblemScreen from "$lib/problems/ProblemScreen.svelte";

  const NOT_FOUND = 404;

  const isMissing = $derived(page.status === NOT_FOUND);
</script>

{#snippet goToLibrary()}
  <a
    href={resolve("/")}
    class="flex items-center justify-center rounded-full bg-accent px-xl font-bold text-on-accent min-block-touch-target medium:rounded-control"
  >
    {m.problem_go_to_library()}
  </a>
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
