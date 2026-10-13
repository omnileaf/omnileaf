<script lang="ts" module>
  const CONFIRM =
    "rounded-full px-lg text-body font-semibold transition-control min-block-touch-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ios:max-medium:rounded-ios-button medium:rounded-button medium:text-label medium:min-block-pointer-target";

  const LOOKS = {
    "confirm-cancel": `${CONFIRM} bg-chip hover:tint-hover active:tint-pressed medium:border medium:border-border medium:bg-card`,
    "confirm-danger": `${CONFIRM} bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-pressed`,
    "crash-phone-primary":
      "rounded-full bg-accent text-callout font-bold text-on-accent min-block-crash-screen-button ios:rounded-crash-screen-button",
    "crash-phone-secondary":
      "rounded-full border border-quiet-edge text-callout font-bold min-block-crash-screen-button ios:rounded-crash-screen-button",
    "crash-dialog-copy":
      "rounded-dialog-button px-md text-label font-semibold text-accent min-block-dialog-button touch:min-block-touch-target",
    "crash-dialog-secondary":
      "rounded-dialog-button border border-border px-lg text-label font-semibold min-block-dialog-button touch:min-block-touch-target",
    "crash-dialog-primary":
      "rounded-dialog-button bg-accent px-lg text-label font-semibold text-on-accent min-block-dialog-button touch:min-block-touch-target",
  } satisfies Record<string, string>;

  export type ButtonLook = keyof typeof LOOKS;
</script>

<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte";
  import { Button as ButtonPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

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
    LOOKS[look],
    isBusy && "inline-flex items-center justify-center gap-sm",
    className,
  )}
  aria-busy={isBusy || undefined}
  aria-disabled={isBusy || undefined}
  onclick={click}
  {...restProps}
>
  {#if isBusy}
    <LoaderCircle
      size={BUSY_ICON_SIZE}
      aria-hidden="true"
      class="shrink-0 motion-safe:animate-spin"
    />
  {/if}
  {@render children?.()}
</ButtonPrimitive.Root>
