<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { m } from "#lib/paraglide/messages.js";
  import type { UpdateCheck } from "#lib/updates/update-check.svelte.ts";

  import AboutButtonRow from "./AboutButtonRow.svelte";
  import type { AboutLook } from "./look";

  let { checking, look }: { checking: UpdateCheck; look: AboutLook } = $props();

  let checkedHint: string | undefined = $state();

  onMount(() => {
    void checking.load();
  });

  async function check(): Promise<void> {
    await checking.check();
    checkedHint = checking.hint;
  }
</script>

<li>
  <AboutButtonRow
    icon={RefreshCw}
    iconName="refresh-cw"
    label={m.about_check_for_updates()}
    hint={checking.hint}
    {look}
    isBusy={checking.phase === "checking"}
    onPress={() => {
      void check();
    }}
  />
  <span role="status" class="sr-only">{checkedHint}</span>
</li>
