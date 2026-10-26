<script lang="ts" module>
  export type ModalView = "phone" | "wide";
</script>

<script lang="ts">
  import {
    Dialog as DialogPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { DialogContent } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import { SheetContent } from "#lib/components/ui/sheet/index.ts";
  import { MEDIUM_QUERY } from "#lib/page/breakpoints.ts";

  let {
    ref = $bindable(null),
    wideLook = "dialog",
    phoneLook = "drawer",
    wideClass,
    phoneClass,
    phoneOverlayClass,
    onDismiss,
    children,
    ...restProps
  }: Omit<WithoutChildrenOrChild<DialogPrimitive.ContentProps>, "class"> & {
    wideLook?: "dialog" | "sheet";
    phoneLook?: "drawer" | "dialog";
    wideClass?: string;
    phoneClass?: string;
    phoneOverlayClass?: string;
    onDismiss: () => void;
    children: Snippet<[ModalView]>;
  } = $props();

  const isWide = new MediaQuery(MEDIUM_QUERY);
</script>

{#if !isWide.current && phoneLook === "dialog"}
  <DialogContent
    bind:ref
    class={phoneClass}
    overlayClass={phoneOverlayClass}
    {...restProps}
  >
    {@render children("phone")}
  </DialogContent>
{:else if !isWide.current}
  <DrawerContent bind:ref class={phoneClass} {onDismiss} {...restProps}>
    {@render children("phone")}
  </DrawerContent>
{:else if wideLook === "sheet"}
  <SheetContent bind:ref class={wideClass} {...restProps}>
    {@render children("wide")}
  </SheetContent>
{:else}
  <DialogContent bind:ref class={wideClass} {...restProps}>
    {@render children("wide")}
  </DialogContent>
{/if}
