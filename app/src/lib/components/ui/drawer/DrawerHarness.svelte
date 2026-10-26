<script lang="ts">
  import { Dialog } from "bits-ui";

  import { DrawerContent } from "./index.ts";
  import type { SheetBackdrop, SheetHeight } from "./sheet.ts";

  let {
    class: className,
    height = "fit",
    backdrop = "dimmed",
  }: {
    class?: string | undefined;
    height?: SheetHeight;
    backdrop?: SheetBackdrop;
  } = $props();
</script>

<Dialog.Root open>
  <DrawerContent
    onDismiss={() => undefined}
    aria-label="Volume 3"
    class={className}
    {height}
    {backdrop}
  >
    <p>Mark read</p>
  </DrawerContent>
</Dialog.Root>
