<script lang="ts">
  import ReceivedTime from "#lib/components/received-time.svelte";
  import { Card, CardContent } from "#lib/components/ui/card/index.ts";
  import { copy } from "#lib/copy.ts";
  import type { Listed } from "#lib/wire.ts";

  let { report }: { report: Listed } = $props();

  const TERM = "text-label font-semibold text-muted";
  const DEFINITION = "mbs-0.5 text-body";
</script>

<Card>
  <CardContent>
    <dl class="grid grid-cols-2 gap-4 tablet:grid-cols-4">
      <div>
        <dt class={TERM}>{copy.report.facts.platform}</dt>
        <dd class={DEFINITION}>{report.platform}</dd>
      </div>
      <div>
        <dt class={TERM}>{copy.report.facts.version}</dt>
        <dd class="{DEFINITION} tabular-nums">{report.version}</dd>
      </div>
      <div class="col-span-2">
        <dt class={TERM}>{copy.report.facts.received}</dt>
        <dd class={DEFINITION}><ReceivedTime at={report.receivedAt} /></dd>
      </div>
    </dl>
  </CardContent>
</Card>
