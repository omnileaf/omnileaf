<script lang="ts">
  import { resolve } from "$app/paths";
  import { bookIdIn } from "#lib/reader/opened-book.ts";
  import {
    setSmartFeatures,
    SmartFeatures,
  } from "#lib/reader/smart-features.svelte.ts";

  import {
    setSkipUpNextSetting,
    SkipUpNextSetting,
  } from "./skip-up-next.svelte.ts";
  import UpNext from "./UpNext.svelte";

  const FINISHED = bookIdIn("0190a3e4-0000-8000-8000-0000000000b6");
  const NEXT = bookIdIn("0190a3e4-0000-8000-8000-0000000000b7");
  const SERIES = "0190a3e4-0000-8000-8000-0000000000a4";

  setSmartFeatures(new SmartFeatures(undefined));
  setSkipUpNextSetting(new SkipUpNextSetting(undefined));

  if (FINISHED === undefined || NEXT === undefined) {
    throw new Error("the sample ids have no book id's shape");
  }
</script>

<UpNext
  book={FINISHED}
  title="Volume 3"
  seriesTitle="Sample Series 04"
  seriesHref={resolve("/(app)/series/[id]", { id: SERIES })}
  next={{
    id: NEXT,
    title: "Volume 4",
    cover: null,
    pageCount: 184,
    reading: { state: "notStarted" },
  }}
  nextHref={resolve("/read/[book]", { book: NEXT })}
  direction="leftToRight"
/>
