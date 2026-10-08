<script lang="ts">
  import { DatabaseZap, type LucideIcon, TriangleAlert } from "@lucide/svelte";

  import type { LinkOpening } from "#lib/about/link-opening.svelte.ts";
  import type { LibraryProblem, ProjectLink } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ProblemScreen from "./ProblemScreen.svelte";

  let { problem, opening }: { problem: LibraryProblem; opening: LinkOpening } =
    $props();

  interface LibraryProblemText {
    readonly icon: LucideIcon;
    readonly title: string;
    readonly body: string;
    readonly link: ProjectLink;
    readonly action: string;
  }

  const screen: LibraryProblemText = $derived(
    problem === "writtenByANewerVersion"
      ? {
          icon: DatabaseZap,
          title: m.problem_library_newer_title(),
          body: m.problem_library_newer_body(),
          link: "latestRelease",
          action: m.problem_library_newer_action(),
        }
      : {
          icon: TriangleAlert,
          title: m.problem_library_failed_title(),
          body: m.problem_library_failed_body(),
          link: "newIssue",
          action: m.about_report_problem(),
        },
  );
</script>

{#snippet openProjectPage()}
  <button
    type="button"
    class="flex items-center justify-center rounded-full bg-accent px-xl font-bold text-on-accent min-block-touch-target medium:rounded-control"
    onclick={() => {
      void opening.open(screen.link);
    }}
  >
    {screen.action}
  </button>
{/snippet}

<main class="px-gutter">
  <ProblemScreen
    icon={screen.icon}
    title={screen.title}
    body={screen.body}
    actions={openProjectPage}
  />
  <div role="alert" class="mx-auto text-footnote max-inline-problem">
    {#if opening.hasFailed}
      <p class="mbs-sm">{m.about_browser_unavailable()}</p>
    {/if}
  </div>
</main>
