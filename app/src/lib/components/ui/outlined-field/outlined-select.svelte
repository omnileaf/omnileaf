<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import type { ClassValue, HTMLSelectAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { OUTLINED_FIELD_LABEL } from "./looks.ts";

  const CHEVRON_SIZE = 24;

  let {
    label,
    labelClass = "bg-background",
    class: className,
    children,
    ...selectProps
  }: Omit<HTMLSelectAttributes, "id" | "class" | "children"> & {
    label: string;
    labelClass?: ClassValue;
    class?: ClassValue;
    children: Snippet;
  } = $props();

  const id = $props.id();
</script>

<div
  data-slot="outlined-select"
  class={cn("relative min-inline-none", className)}
>
  <label
    for={id}
    class={cn(OUTLINED_FIELD_LABEL, "pointer-events-none", labelClass)}
  >
    {label}
  </label>
  <select
    {id}
    class="appearance-none rounded-native-outlined-field border border-native-button-outline-edge bg-transparent ps-lg pe-select-end text-body text-ellipsis outline-none block-native-outlined-field inline-full focus-visible:border-accent"
    {...selectProps}
  >
    {@render children()}
  </select>
  <ChevronDown
    size={CHEVRON_SIZE}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-md inset-bs-1/2 -translate-y-1/2 text-muted"
  />
</div>
