<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Item } from "#lib/components/ui/item/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { UpdateCheck } from "#lib/updates/update-check.svelte.ts";

  import { type AboutLook, ROW_LOOKS } from "./look";
  import RowText from "./RowText.svelte";

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
  <Item look={ROW_LOOKS[look]}>
    {#snippet child({ props })}
      <Button
        {...props}
        type="button"
        look="row"
        aria-busy={checking.phase === "checking"}
        onclick={() => {
          void check();
        }}
      >
        <RowText
          icon={RefreshCw}
          iconName="refresh-cw"
          label={m.about_check_for_updates()}
          hint={checking.hint}
          {look}
        />
      </Button>
    {/snippet}
  </Item>
  <span role="status" class="sr-only">{checkedHint}</span>
</li>
