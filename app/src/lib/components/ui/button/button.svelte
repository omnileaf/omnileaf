<script lang="ts">
  import { Button as ButtonPrimitive, mergeProps } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import {
    type ButtonLook,
    type ButtonSize,
    type ButtonVariant,
    buttonClasses,
    variantClasses,
  } from "./looks.ts";

  type ButtonElementProps = Extract<
    ButtonPrimitive.RootProps,
    { href?: never }
  >;
  type ClickEvent = Parameters<NonNullable<ButtonElementProps["onclick"]>>[0];
  type Look = {
    look?: ButtonLook;
    variant?: ButtonVariant;
    size?: ButtonSize;
  } & ({ iconOnly?: false; label?: never } | { iconOnly: true; label: string });

  let {
    ref = $bindable(null),
    look,
    variant,
    size = "regular",
    iconOnly = false,
    label,
    disabled,
    class: className,
    children,
    onclick,
    onClickPromise,
    ...restProps
  }: ButtonElementProps &
    Look & {
      onClickPromise?: (event: MouseEvent) => Promise<void>;
    } = $props();

  const BUSY_ICON_SIZE = 18;

  const platform = currentPlatform();
  const width = new WindowWidth();
  const classes = $derived(
    look === undefined
      ? variantClasses(variant ?? "secondary", size, iconOnly, platform)
      : buttonClasses(look, platform, {
          variant,
          size,
          isIconOnly: iconOnly,
          width: width.current,
        }),
  );
  const tooltip = $derived(
    platform === "ios" || disabled === true ? undefined : label,
  );

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

{#snippet content()}
  {#if isBusy}
    <Spinner size={BUSY_ICON_SIZE} class="shrink-0" />
  {/if}
  {#if !(isBusy && iconOnly)}
    {@render children?.()}
  {/if}
{/snippet}

{#if iconOnly}
  <Tooltip
    bind:ref
    label={tooltip}
    class={cn(
      classes,
      isBusy && "inline-flex items-center justify-center gap-sm",
      className,
    )}
    aria-label={label}
    aria-busy={isBusy || undefined}
    aria-disabled={isBusy || undefined}
    onclick={click}
  >
    {#snippet child({ props })}
      <ButtonPrimitive.Root
        {...mergeProps(props, restProps)}
        {disabled}
        children={content}
      />
    {/snippet}
  </Tooltip>
{:else}
  <ButtonPrimitive.Root
    bind:ref
    class={cn(
      classes,
      isBusy && "inline-flex items-center justify-center gap-sm",
      className,
    )}
    aria-busy={isBusy || undefined}
    aria-disabled={isBusy || undefined}
    onclick={click}
    {disabled}
    {...restProps}
    children={content}
  />
{/if}
