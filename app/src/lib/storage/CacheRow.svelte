<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    title,
    detail,
    isClearing,
    onClear,
  }: {
    title: string;
    detail: string;
    isClearing: boolean;
    onClear: () => void;
  } = $props();

  const android = new AndroidPhone();
</script>

<div class="flex items-center gap-md px-lg py-md">
  <div class="flex flex-1 flex-col gap-2xs min-inline-none">
    <span
      class={[
        "text-body",
        android.isOn
          ? "font-regular tracking-native-row-title"
          : "font-medium expanded:font-semibold desktop:text-callout",
      ]}>{title}</span
    >
    <span
      class={[
        "text-muted",
        android.isOn
          ? "text-native-row-subtitle/native-row-subtitle"
          : "text-detail",
      ]}>{detail}</span
    >
  </div>
  <Button
    type="button"
    look="outline"
    aria-label={m.storage_clear_label({ name: title })}
    disabled={isClearing}
    class={[
      "shrink-0 rounded-full px-lg text-body font-medium disabled:opacity-60 desktop:rounded-shadcn-control desktop:px-md desktop:text-label desktop:min-block-pointer-button",
      android.isOn
        ? "border-0 bg-native-accent-soft text-native-button/native-button font-native-button text-native-on-button-secondary block-native-button"
        : "min-block-touch-target",
    ]}
    onclick={onClear}
  >
    {m.storage_clear()}
  </Button>
</div>
