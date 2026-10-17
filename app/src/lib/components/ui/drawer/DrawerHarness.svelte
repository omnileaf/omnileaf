<script lang="ts">
  import { Dialog } from "bits-ui";

  import { DrawerContent } from "./index.ts";
</script>

<Dialog.Root open>
  <DrawerContent onDismiss={() => undefined} aria-label="Volume 3">
    <p>Mark read</p>
  </DrawerContent>
</Dialog.Root>
