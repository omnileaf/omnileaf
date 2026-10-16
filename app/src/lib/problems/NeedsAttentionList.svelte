<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";

  import type { Problem } from "./needs-attention.svelte";
  import { problemWording, type WordingContext } from "./problem-wording";

  const ICON_SIZE = 16;

  let {
    problems,
    context,
    onFix,
  }: {
    problems: readonly Problem[];
    context: WordingContext;
    onFix: (problem: Problem) => void;
  } = $props();

  function keyOf(problem: Problem): string {
    return problem.kind === "lowSpace"
      ? "low-space"
      : problem.missing.folder.id;
  }

  const listId = $props.id();
</script>

<ul
  class="divide-y divide-border overflow-hidden rounded-list border border-border"
>
  {#each problems as problem, index (keyOf(problem))}
    {@const wording = problemWording(problem, context)}
    {@const titleId = `${listId}-${String(index)}`}
    <li class="flex items-center gap-md py-sm ps-md pe-md">
      <span aria-hidden="true" class="flex shrink-0 text-warning-strong">
        <wording.icon size={ICON_SIZE} />
      </span>
      <div class="flex flex-1 flex-col min-inline-none">
        <span id={titleId} class="text-label font-medium wrap-anywhere"
          >{wording.title}</span
        >
        <span class="line-clamp-2 text-label wrap-anywhere text-muted"
          >{wording.detail}</span
        >
      </div>
      <Button
        type="button"
        look="outline"
        aria-describedby={titleId}
        class="rounded-full px-lg text-body font-medium max-inline-1/2 min-block-touch-target desktop:rounded-shadcn-control desktop:px-md desktop:text-label desktop:min-block-compact-button"
        onclick={() => {
          onFix(problem);
        }}
      >
        {wording.fix}
      </Button>
    </li>
  {/each}
</ul>
