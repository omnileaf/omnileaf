<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import { copy } from "#lib/copy.ts";

  let { text }: { text: string | null } = $props();
</script>

<Card>
  <CardHeader>
    <CardTitle>{copy.report.text.title}</CardTitle>
    <CardDescription>{copy.report.text.hint}</CardDescription>
  </CardHeader>
  <CardContent>
    {#if text === null}
      <p class="text-small text-muted">{copy.report.text.purged}</p>
    {:else}
      <pre
        class="rounded-control border border-border bg-well p-4 font-mono text-label/5 wrap-anywhere whitespace-pre-wrap">{text}</pre>
    {/if}
  </CardContent>
</Card>
