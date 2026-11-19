<script lang="ts">
  import type { SeriesOverview } from "#lib/ipc/bindings.ts";
  import {
    SmartFeatures,
    setSmartFeatures,
  } from "#lib/reader/smart-features.svelte.ts";

  import { SERIES_CONTINUE_WORDS } from "./continue-card.ts";
  import ContinueCard from "./ContinueCard.svelte";

  let { overview }: { overview: SeriesOverview } = $props();

  setSmartFeatures(new SmartFeatures(undefined));
</script>

<ContinueCard
  progress={overview}
  words={SERIES_CONTINUE_WORDS}
  cover={{ kind: "none" }}
  coverUrl={() => ""}
  isWide={false}
/>
