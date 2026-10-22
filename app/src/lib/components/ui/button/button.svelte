<script lang="ts">
  import { Button as ButtonPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { type ButtonLook, buttonClasses } from "./looks.ts";

  type ButtonElementProps = Extract<
    ButtonPrimitive.RootProps,
    { href?: never }
  >;
  type ClickEvent = Parameters<NonNullable<ButtonElementProps["onclick"]>>[0];

  let {
    ref = $bindable(null),
    look,
    class: className,
    children,
    onclick,
    onClickPromise,
    ...restProps
  }: ButtonElementProps & {
    look: ButtonLook;
    onClickPromise?: (event: MouseEvent) => Promise<void>;
  } = $props();

  const BUSY_ICON_SIZE = 18;

  let isBusy = $state(false);

  async function click(event: ClickEvent): Promise<void> {
    if (isBusy) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
    if (onClickPromise === undefined) {
      return;
    }
    isBusy = true;
    try {
      await onClickPromise(event);
    } finally {
      isBusy = false;
    }
  }
</script>

<ButtonPrimitive.Root
  bind:ref
  class={cn(
    buttonClasses(look, currentPlatform()),
    isBusy && "inline-flex items-center justify-center gap-sm",
    className,
  )}
  aria-busy={isBusy || undefined}
  aria-disabled={isBusy || undefined}
  onclick={click}
  {...restProps}
>
  {#if isBusy}
    <Spinner size={BUSY_ICON_SIZE} class="shrink-0" />
  {/if}
  {@render children?.()}
</ButtonPrimitive.Root>
