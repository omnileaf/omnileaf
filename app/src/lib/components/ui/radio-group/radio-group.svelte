<script lang="ts" generics="Option extends string">
  import { RadioGroup as RadioGroupPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    options,
    chosen,
    onChoose,
    class: className,
    ...restProps
  }: Omit<RadioGroupPrimitive.RootProps, "value" | "onValueChange"> & {
    options: readonly Option[];
    chosen: Option;
    onChoose: (option: Option) => void;
  } = $props();

  /** Announces the choice with a bubbling change, as a native radio does, so a screen watching for changed settings hears it. */
  function choose(value: string): void {
    const option = options.find((candidate) => candidate === value);
    if (option === undefined) {
      return;
    }
    ref?.dispatchEvent(new Event("change", { bubbles: true }));
    onChoose(option);
  }
</script>

<RadioGroupPrimitive.Root
  bind:ref
  bind:value={() => chosen, choose}
  class={cn(className)}
  {...restProps}
/>
