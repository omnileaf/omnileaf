<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<h1
  tabindex="-1"
  class="text-page-title font-bold tracking-tight touch:max-medium:ps-xs"
>
  {title}
</h1>
