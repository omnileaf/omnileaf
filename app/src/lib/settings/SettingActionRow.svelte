<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";

  import { FLUSH_BLEED } from "./android-flush-look.ts";
  import SettingWords from "./SettingWords.svelte";

  interface Props {
    readonly label: string;
    readonly description?: string | undefined;
    readonly onPress: () => void;
    readonly class?: ClassValue;
  }

  let { label, description, onPress, class: className }: Props = $props();

  const ROW =
    "flex items-center gap-md px-lg py-md text-start inline-full min-block-touch-target";

  const ANDROID_ROW = `${FLUSH_BLEED} flex items-center gap-lg ps-lg pe-xl py-sm text-start text-body min-block-native-row-two`;

  const TINTED = "transition-control hover:tint-hover active:tint-pressed";

  const id = $props.id();
  const android = new AndroidPhone();
</script>

<button
  type="button"
  class={[android.isOn ? ANDROID_ROW : ROW, TINTED, ROW_FOCUS_RING, className]}
  onclick={onPress}
>
  <SettingWords
    {id}
    {label}
    {description}
    look={android.isOn ? "android" : "todays"}
  />
</button>
