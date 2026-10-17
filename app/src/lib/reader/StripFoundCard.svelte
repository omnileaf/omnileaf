<script lang="ts">
  import { ArrowDownUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    Card,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 20;
  const FOOTER_BUTTON =
    "flex-1 rounded-shadcn-control px-lg font-medium min-block-touch-target expanded:flex-none expanded:text-small expanded:min-block-pointer-button";

  let { onChange, onDone }: { onChange: () => void; onDone: () => void } =
    $props();

  const titleId = $props.id();
</script>

<Card
  role="note"
  aria-labelledby={titleId}
  class="absolute inset-x-lg inset-be-reader-guide flex flex-col gap-lg py-lg shadow-reader-glass expanded:inset-x-none expanded:mx-auto expanded:inline-reader-guide-wide"
>
  <CardHeader class="px-lg">
    <div class="flex items-center gap-sm">
      <span
        class="flex items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
      >
        <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
      </span>
      <CardTitle id={titleId} class="text-group-title">
        {m.reader_strip_found_title()}
      </CardTitle>
    </div>
    <CardDescription class="text-body expanded:text-small"
      >{m.reader_strip_found_body()}</CardDescription
    >
  </CardHeader>
  <CardFooter class="gap-sm px-lg expanded:justify-end">
    <Button
      type="button"
      look="outline"
      class={FOOTER_BUTTON}
      onclick={onChange}
    >
      {m.reader_change()}
    </Button>
    <Button type="button" look="primary" class={FOOTER_BUTTON} onclick={onDone}>
      {m.reader_guide_done()}
    </Button>
  </CardFooter>
</Card>
