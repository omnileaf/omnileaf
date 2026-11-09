<script lang="ts">
  import Copy from "@lucide/svelte/icons/copy";
  import { tick } from "svelte";

  import { resolve } from "$app/paths";

  import { browserClipboard } from "#lib/browser-clipboard.ts";
  import { cn } from "#lib/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { buttonLook } from "#lib/components/ui/button/variants.ts";
  import { Card, CardContent } from "#lib/components/ui/card/index.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { Label } from "#lib/components/ui/label/index.ts";
  import { Textarea } from "#lib/components/ui/textarea/index.ts";
  import { copy } from "#lib/copy.ts";
  import { confirmationFor } from "#lib/copy-confirmation.ts";
  import { CopyControl } from "#lib/copy-control.svelte.ts";
  import { pathSegment } from "#lib/path-segment.ts";
  import { selectAll } from "#lib/select-all.ts";

  let { code, body }: { code: string; body: string } = $props();

  const TEXT_ID = "issue-text";
  const HINT_ID = "issue-hint";

  let area: HTMLTextAreaElement | null = $state(null);

  function select(): void {
    selectAll(area);
  }

  const copying = new CopyControl({
    clipboard: browserClipboard,
    select,
    settle: tick,
  });
</script>

<Card>
  <CardContent class="grid gap-4">
    <div class="grid gap-1.5">
      <Label for={TEXT_ID}>{copy.issue.textLabel}</Label>
      <Textarea
        bind:ref={area}
        id={TEXT_ID}
        readonly
        rows={12}
        value={body}
        aria-describedby={HINT_ID}
        class="font-mono"
      />
      <p id={HINT_ID} class="text-label text-muted">{copy.issue.hint}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button
        onclick={() => {
          void copying.copy(body);
        }}
      >
        <Copy class="block-4 inline-4" />
        {copy.issue.copyText}
      </Button>
      <a
        href={resolve("/reports/[code]", { code: pathSegment(code) })}
        class={cn(buttonLook("ghost", "default"), FOCUS_RING)}
      >
        {copy.issue.backToReport}
      </a>
    </div>
    <p role="status" aria-live="polite" class="text-small text-muted">
      {confirmationFor(copying.outcome)}
    </p>
  </CardContent>
</Card>
