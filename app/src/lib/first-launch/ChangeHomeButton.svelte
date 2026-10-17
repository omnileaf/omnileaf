<script lang="ts">
  import { BUTTON_LOOKS } from "#lib/components/ui/button/looks.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";
</script>

<Tooltip
  label={m.reader_coming_soon({ feature: m.first_launch_home_change() })}
  type="button"
  aria-disabled="true"
  class={BUTTON_LOOKS["card-outline"]}
>
  {m.first_launch_home_change()}
</Tooltip>
