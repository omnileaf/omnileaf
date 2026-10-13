<script lang="ts">
  import type { HTMLLiAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { useStepperItem } from "./stepper.svelte.ts";

  let { class: className, children, ...rest }: HTMLLiAttributes = $props();

  useStepperItem();
</script>

<li
  data-slot="stepper-item"
  class={cn("relative flex flex-1 justify-center", className)}
  {...rest}
>
  {@render children?.()}
</li>
