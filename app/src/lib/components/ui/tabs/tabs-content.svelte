<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  let { ref = $bindable(null), ...restProps }: TabsPrimitive.ContentProps =
    $props();
</script>

<TabsPrimitive.Content bind:ref data-slot="tabs-content" {...restProps} />
