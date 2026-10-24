<script lang="ts">
  import { Dialog } from "bits-ui";

  import { DrawerContent } from "./index.ts";

  let { class: className }: { class?: string | undefined } = $props();
</script>

<Dialog.Root open>
  <DrawerContent
    onDismiss={() => undefined}
    aria-label="Volume 3"
    class={className}
  >
    <p>Mark read</p>
  </DrawerContent>
</Dialog.Root>
