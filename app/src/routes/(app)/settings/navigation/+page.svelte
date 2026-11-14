<script lang="ts">
  import TapOpenTabChoice from "#lib/navigation/TapOpenTabChoice.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
</script>

<SectionHeading title={m.navigation_settings_title()} />
<div class="mbs-pane-gap flex flex-col android:max-medium:mbs-none">
  <TapOpenTabChoice />
</div>
