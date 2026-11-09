<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { HTMLLiAttributes } from "svelte/elements";

  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    ...restProps
  }: Omit<
    WithElementRef<HTMLLiAttributes, HTMLLIElement>,
    "children"
  > = $props();
</script>

<li
  bind:this={ref}
  data-slot="breadcrumb-separator"
  role="presentation"
  aria-hidden="true"
  {...restProps}
>
  <ChevronRight class="block-3.5 inline-3.5 rtl:rotate-180" />
</li>
