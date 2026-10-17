<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<h1
  tabindex="-1"
  class="text-page-title font-bold tracking-tight wrap-break-word android:font-regular android:tracking-normal touch:max-medium:ps-xs heading-stacked:wrap-anywhere in-toolbar:truncate in-toolbar:text-body in-toolbar:font-semibold in-toolbar:tracking-normal"
>
  {title}
</h1>
