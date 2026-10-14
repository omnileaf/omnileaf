<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<h1
  tabindex="-1"
  class="text-page-title font-bold tracking-tight wrap-break-word touch:max-medium:ps-xs heading-stacked:wrap-anywhere"
>
  {title}
</h1>
