<script lang="ts">
  import type { Plan, PlanStatus } from "./plans.ts";

  let { plan }: { plan: Plan } = $props();

  const BADGES: Record<PlanStatus, { label: string; class: string }> = {
    "in-development": {
      label: "In development",
      class: "bg-accent-soft text-accent-ink",
    },
    planned: { label: "Planned", class: "bg-chip text-muted" },
  };

  const badge = $derived(BADGES[plan.status]);
</script>

<article
  class="flex grow basis-60 flex-col gap-2.5 rounded-card border border-border bg-card p-6 min-inline-0"
>
  <span
    class="self-start rounded-full px-2.5 py-0.5 text-label font-semibold {badge.class}"
    >{badge.label}</span
  >
  <h3 class="m-0 text-lead font-semibold">{plan.title}</h3>
  <p class="m-0 text-muted">{plan.summary}</p>
</article>
