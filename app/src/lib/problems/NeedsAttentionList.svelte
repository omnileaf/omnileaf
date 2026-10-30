<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { attentionLook } from "./attention-look.ts";
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
  const look = attentionLook(currentPlatform());
</script>

<ul class={look.list}>
  {#each problems as problem, index (keyOf(problem))}
    {@const wording = problemWording(problem, context)}
    {@const titleId = `${listId}-${String(index)}`}
    <li class={["flex items-center", look.row]}>
      <span aria-hidden="true" class={["flex shrink-0", look.icon]}>
        <wording.icon size={ICON_SIZE} />
      </span>
      <div class="flex flex-1 flex-col min-inline-none">
        <span id={titleId} class={["wrap-anywhere", look.title]}
          >{wording.title}</span
        >
        <span class={["wrap-anywhere", look.detail]}>{wording.detail}</span>
      </div>
      <Button
        type="button"
        {...look.fix}
        aria-describedby={titleId}
        onclick={() => {
          onFix(problem);
        }}
      >
        {wording.fix}
      </Button>
    </li>
  {/each}
</ul>
