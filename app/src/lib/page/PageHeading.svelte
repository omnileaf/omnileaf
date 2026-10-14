<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<h1
  tabindex="-1"
  class="text-page-title font-bold tracking-tight wrap-break-word touch:max-medium:ps-xs heading-stacked:wrap-anywhere in-toolbar:text-body in-toolbar:font-semibold in-toolbar:tracking-normal"
>
  {title}
</h1>
