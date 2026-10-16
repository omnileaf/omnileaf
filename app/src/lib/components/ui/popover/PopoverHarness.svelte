<script lang="ts">
  import { Popover } from "bits-ui";

  import { PopoverContent } from "./index.ts";
</script>

<Popover.Root open>
  <Popover.Trigger>Light</Popover.Trigger>
  <PopoverContent aria-label="Light">
    <p>Brightness</p>
  </PopoverContent>
</Popover.Root>
