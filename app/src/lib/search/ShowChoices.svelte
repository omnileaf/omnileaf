<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import {
    FILTER_CONDITIONS,
    type FilterCondition,
  } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { CONDITION_LABELS } from "./condition-labels";

  interface Choice {
    readonly name: FilterCondition | "everything";
    readonly label: string;
    readonly isPressed: boolean;
    readonly choose: () => void;
  }

  let {
    conditions,
    onToggle,
    onEverything,
    class: className,
  }: {
    conditions: readonly FilterCondition[];
    onToggle: (condition: FilterCondition) => void;
    onEverything: () => void;
    class?: ClassValue;
  } = $props();

  const choices: readonly Choice[] = $derived([
    {
      name: "everything",
      label: m.search_everything(),
      isPressed: conditions.length === 0,
      choose: onEverything,
    },
    ...FILTER_CONDITIONS.map((condition) => ({
      name: condition,
      label: CONDITION_LABELS[condition](),
      isPressed: conditions.includes(condition),
      choose: () => {
        onToggle(condition);
      },
    })),
  ]);
</script>

<div
  role="group"
  aria-label={m.search_show()}
  class={["flex gap-icon-gap overflow-x-auto", className]}
>
  {#each choices as choice (choice.name)}
    <button
      type="button"
      aria-pressed={choice.isPressed}
      class={[
        "shrink-0 rounded-full border px-md text-detail whitespace-nowrap block-scope-chip",
        choice.isPressed
          ? "border-accent bg-accent-soft font-bold"
          : "border-border font-medium",
      ]}
      onclick={choice.choose}
    >
      {choice.label}
    </button>
  {/each}
</div>
