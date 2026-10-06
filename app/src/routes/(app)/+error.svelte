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
    class="flex items-center justify-center rounded-control bg-accent px-xl font-bold text-on-accent transition-control min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed ios:max-medium:rounded-phone-button android:max-medium:rounded-full touch:max-medium:text-callout touch:max-medium:min-block-phone-button desktop:px-lg desktop:text-label desktop:min-block-pointer-button"
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
