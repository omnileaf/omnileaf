<script lang="ts">
  import {
    Toaster as Sonner,
    type ToasterProps as SonnerProps,
  } from "svelte-sonner";

  import { cn } from "#lib/components/cn.ts";

  const HOTKEY = ["F6"];
  const VISIBLE_TOASTS = 3;
  const SPREAD_GAP_PX = 8;

  let { toastOptions, ...restProps }: SonnerProps = $props();
</script>

<Sonner
  hotkey={HOTKEY}
  visibleToasts={VISIBLE_TOASTS}
  gap={SPREAD_GAP_PX}
  toastOptions={{
    ...toastOptions,
    unstyled: true,
    class: cn("group medium:inline-toast", toastOptions?.class),
  }}
  {...restProps}
/>
