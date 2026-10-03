<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import { standInName, standInNumber } from "./stand-ins";
  import StandInCover from "./StandInCover.svelte";

  interface Props {
    readonly showsStandIn: boolean;
    readonly isActive: boolean;
  }

  let { showsStandIn, isActive }: Props = $props();

  const SAMPLE_NUMBER = 4;
  const SAMPLE_CHAPTERS = 230;

  const coverClasses = $derived([
    "shrink-0 inline-cover-thumb outline-offset-2 expanded:inline-full",
    isActive && "outline-2 outline-accent",
  ]);
</script>

<div
  class={[
    "flex flex-1 items-center gap-md min-inline-none expanded:flex-col expanded:items-stretch expanded:gap-sm",
    !isActive && "opacity-55",
  ]}
>
  {#if showsStandIn}
    <StandInCover
      format={m.screenshot_mode_sample_format()}
      class={coverClasses}
    />
  {:else}
    <div
      aria-hidden="true"
      class={[
        "relative aspect-2/3 overflow-hidden rounded-cover bg-sample-cover",
        coverClasses,
      ]}
    >
      <div
        class="absolute -inset-e-1/4 inset-bs-3/10 aspect-square rounded-full bg-sample-cover-art inline-11/12"
      ></div>
      <div
        class="absolute inset-x-none inset-be-1/4 bg-sample-cover-art block-1/12"
      ></div>
      <div
        class="absolute inset-s-xs inset-be-xs text-detail font-bold text-sample-cover-ink expanded:inset-s-sm expanded:inset-be-sm expanded:text-title"
      >
        {standInNumber(SAMPLE_NUMBER)}
      </div>
    </div>
  {/if}
  <div
    class="flex flex-col items-start gap-2xs min-inline-none expanded:contents"
  >
    <span
      class={[
        "rounded-full px-sm text-caption font-bold expanded:order-first expanded:self-start",
        isActive ? "bg-accent text-on-accent" : "bg-chip text-muted",
      ]}
    >
      {showsStandIn ? m.switch_on() : m.switch_off()}
    </span>
    <span class="text-detail font-semibold">
      {showsStandIn
        ? standInName("series", SAMPLE_NUMBER)
        : m.screenshot_mode_sample_title()}
    </span>
    <span class="text-caption text-muted">
      {m.screenshot_mode_sample_chapters({ count: SAMPLE_CHAPTERS })}
    </span>
  </div>
</div>
