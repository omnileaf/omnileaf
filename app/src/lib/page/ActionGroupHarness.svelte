<script lang="ts">
  import { resolve } from "$app/paths";

  import { WindowWidth } from "./breakpoints";
  import { type ActionGroupLook, actionGroupLook } from "./action-group";
  import { currentPlatform } from "./platform";

  const TODAY: ActionGroupLook = {
    group: "flex flex-col gap-sm",
    main: "min-block-touch-target",
    other: "min-block-touch-target",
  };

  const width = new WindowWidth();
  const look = $derived(
    actionGroupLook(currentPlatform(), width.current, TODAY),
  );
</script>

<div class={look.group} aria-label="Actions" role="group">
  <a href={resolve("/(app)")} class={look.main}>Back to the series</a>
  <button type="button" class={look.other}>Show the file</button>
</div>
