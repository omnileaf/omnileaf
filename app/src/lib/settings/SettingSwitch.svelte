<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
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

  const ANDROID_ROW =
    "-mx-page-start -me-page-end flex items-center gap-lg ps-lg pe-xl py-sm text-start text-body min-block-native-row-two";

  const id = $props.id();
  const platform = currentPlatform();
  const width = new WindowWidth();
  const android = new AndroidPhone();
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
      class={["native-target shrink-0 rounded-full", ROW_FOCUS_RING]}
    />
  </div>
{:else}
  <Switch
    bind:checked={() => isOn, onToggle}
    aria-labelledby="{id}-label"
    aria-describedby={description === undefined
      ? undefined
      : `${id}-description`}
    class={[
      android.isOn ? ANDROID_ROW : ROW,
      "hover:tint-hover active:tint-pressed",
      ROW_FOCUS_RING,
      className,
    ]}
  >
    <SettingWords {id} {label} {description} isAndroidPhone={android.isOn} />
  </Switch>
{/if}
