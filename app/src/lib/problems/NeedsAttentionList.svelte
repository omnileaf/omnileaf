<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";

  import type { Problem } from "./needs-attention.svelte";
  import { problemWording } from "./problem-wording";

  const ICON_SIZE = 16;

  let {
    problems,
    usesStandIns,
    onFix,
  }: {
    problems: readonly Problem[];
    usesStandIns: boolean;
    onFix: (problem: Problem) => void;
  } = $props();

  const listId = $props.id();
</script>

<ul
  class="divide-y divide-border overflow-hidden rounded-list border border-border"
>
  {#each problems as problem, index (problem.missing.folder.id)}
    {@const wording = problemWording(problem, usesStandIns)}
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
        class="shrink-0 rounded-full px-lg text-body font-medium min-block-touch-target desktop:rounded-shadcn-control desktop:px-md desktop:text-label desktop:min-block-compact-button"
        onclick={() => {
          onFix(problem);
        }}
      >
        {wording.fix}
      </Button>
    </li>
  {/each}
</ul>
