<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { menuLook } from "../menu-look.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.SeparatorProps = $props();
  const look = menuLook(currentPlatform());
</script>

<DropdownMenuPrimitive.Separator
  bind:ref
  class={cn(
    "-mx-menu-pad my-xs border-bs border-menu-edge android:medium:mx-none",
    look.rule,
    className,
  )}
  {...restProps}
/>
