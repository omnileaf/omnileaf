<script lang="ts">
  import { Minus } from "@lucide/svelte";
  import {
    Checkbox as CheckboxPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  import CheckMark from "./check-mark.svelte";

  const DASH_SIZE = 14;
  const DASH_STROKE = 3;

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
  bind:ref
  bind:checked
  bind:indeterminate
  class={cn(
    "flex shrink-0 items-center justify-center rounded-checkbox border border-control-edge bg-checkbox-off text-on-accent block-checkbox inline-checkbox focus-visible:focus-ring aria-checked:border-accent aria-checked:bg-accent android:border-2 desktop:shadow-raised",
    indeterminate && "border-accent bg-accent",
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked: isChecked, indeterminate: isSome })}
    {#if isSome}
      <Minus size={DASH_SIZE} strokeWidth={DASH_STROKE} aria-hidden="true" />
    {:else if isChecked}
      <CheckMark />
    {/if}
  {/snippet}
</CheckboxPrimitive.Root>
