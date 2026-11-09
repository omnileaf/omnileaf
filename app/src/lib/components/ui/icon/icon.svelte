<script lang="ts">
  import type { ClassValue, HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import type { IconName } from "#lib/icons/names.ts";

  let {
    name,
    filled = false,
    size,
    class: className,
    style,
    ...rest
  }: {
    name: IconName;
    filled?: boolean | undefined;
    size?: number | string | undefined;
    class?: ClassValue | undefined;
    style?: string | undefined;
  } & HTMLAttributes<HTMLSpanElement> = $props();

  const sizeValue = $derived(
    typeof size === "number" ? `${String(size)}px` : size,
  );
  const sizeStyle = $derived(
    sizeValue !== undefined
      ? `width: ${sizeValue}; height: ${sizeValue};`
      : undefined,
  );
</script>

<span
  data-icon={name}
  data-filled={filled ? "" : undefined}
  aria-hidden="true"
  style={[sizeStyle, style].filter(Boolean).join(" ") || undefined}
  class={cn("block-native-icon inline-native-icon", className)}
  {...rest}
></span>
