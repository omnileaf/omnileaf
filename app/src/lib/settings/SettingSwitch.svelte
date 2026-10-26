<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";

  import SettingWords from "./SettingWords.svelte";

  interface Props {
    readonly label: string;
    readonly description?: string;
    readonly isOn: boolean;
    readonly onToggle: () => void;
    readonly class?: ClassValue;
  }

  let {
    label,
    description,
    isOn,
    onToggle,
    class: className,
  }: Props = $props();

  const ROW =
    "flex items-center gap-md px-lg py-md text-start inline-full min-block-touch-target";
  const FOCUS =
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

  const id = $props.id();
  const platform = currentPlatform();
  const width = new WindowWidth();
  const togglesFromSwitchAlone = $derived(
    platform === "ios" && isPhone(platform, width.current),
  );
</script>

{#if togglesFromSwitchAlone}
  <div class={[ROW, className]}>
    <SettingWords {id} {label} {description} />
    <Switch
      bind:checked={() => isOn, onToggle}
      aria-labelledby="{id}-label"
      aria-describedby={description === undefined
        ? undefined
        : `${id}-description`}
      class={["shrink-0 rounded-full", FOCUS]}
    />
  </div>
{:else}
  <Switch
    bind:checked={() => isOn, onToggle}
    aria-labelledby="{id}-label"
    aria-describedby={description === undefined
      ? undefined
      : `${id}-description`}
    class={[ROW, "hover:tint-hover active:tint-pressed", FOCUS, className]}
  >
    <SettingWords {id} {label} {description} />
  </Switch>
{/if}
