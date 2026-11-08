<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";

  import { FLUSH_BLEED } from "./android-flush-look.ts";
  import { ANDROID_ROW, ROW, TINTED } from "./setting-row-look.ts";
  import SettingWords from "./SettingWords.svelte";

  interface Props {
    readonly label: string;
    readonly description?: string | undefined;
    readonly onPress: () => void;
    readonly bleeds?: boolean;
    readonly class?: ClassValue;
  }

  let {
    label,
    description,
    onPress,
    class: className,
    bleeds = false,
  }: Props = $props();

  const id = $props.id();
  const android = new AndroidPhone();
</script>

<button
  type="button"
  class={[
    android.isOn ? [ANDROID_ROW, bleeds ? FLUSH_BLEED : "inline-full"] : ROW,
    TINTED,
    "transition-control",
    ROW_FOCUS_RING,
    className,
  ]}
  onclick={onPress}
>
  <SettingWords
    {id}
    {label}
    {description}
    look={android.isOn ? "android" : "todays"}
  />
</button>
