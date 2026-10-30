<script lang="ts">
  import { CircleCheck } from "@lucide/svelte";

  import type { InfoBarSeverity } from "./info-bar-severity";
  import WindowsInfoBar from "./WindowsInfoBar.svelte";

  let {
    severity,
    title,
    body,
  }: { severity: InfoBarSeverity; title: string; body?: string } = $props();
</script>

<WindowsInfoBar
  {severity}
  {title}
  {body}
  action={{ label: "Undo", run: () => undefined }}
  onDismiss={() => undefined}
>
  {#snippet icon()}
    <CircleCheck size={20} class="text-accent" />
  {/snippet}
</WindowsInfoBar>
