<script lang="ts">
  import StripScrubber from "./StripScrubber.svelte";

  let {
    progress,
    shown = 40,
    onScrub = nothing,
    onSeek = nothing,
  }: {
    progress: number;
    shown?: number;
    onScrub?: (along: number) => void;
    onSeek?: (index: number) => void;
  } = $props();

  function nothing(): void {}
</script>

<main class="fixed inset-none" style="--reader-toast-room: 140px">
  <StripScrubber
    {progress}
    {shown}
    count={64}
    position="41 / 64"
    {onScrub}
    {onSeek}
  />
</main>
