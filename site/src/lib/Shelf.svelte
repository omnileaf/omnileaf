<script lang="ts">
  const SPINES = [
    "block-42 bg-spine-mint",
    "block-55 bg-spine-green",
    "block-38 bg-spine-gold",
    "block-50 bg-spine-blue",
    "block-45 bg-spine-paper",
    "block-59 bg-spine-sand",
    "block-40 bg-spine-teal",
    "block-49 bg-spine-rose",
  ] as const;
</script>

<figure
  class="m-0 flex shrink grow basis-85 flex-col gap-6 overflow-hidden rounded-panel bg-panel px-7 pbs-7 min-block-90 min-inline-0"
>
  <figcaption class="text-small text-on-panel">
    Screenshots arrive with the first release.
  </figcaption>
  <div aria-hidden="true" class="flex flex-1 items-end justify-center gap-2.5">
    {#each SPINES as spine (spine)}
      <div class="grow basis-0 rounded-t-spine max-inline-11 {spine}"></div>
    {/each}
  </div>
  <div aria-hidden="true" class="-mx-7 bg-shelf block-3.5"></div>
</figure>
