<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
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
</script>

<div class="flex items-center gap-md px-lg py-md">
  <div class="flex flex-1 flex-col gap-2xs min-inline-none">
    <span
      class="text-body font-medium expanded:font-semibold android:max-medium:font-regular desktop:text-callout"
      >{title}</span
    >
    <span
      class="text-detail text-muted android:max-medium:text-native-row-subtitle/native-row-subtitle"
      >{detail}</span
    >
  </div>
  <Button
    type="button"
    look="outline"
    aria-label={m.storage_clear_label({ name: title })}
    disabled={isClearing}
    class="shrink-0 rounded-full px-lg text-body font-medium min-block-touch-target disabled:opacity-60 android:max-medium:border-0 android:max-medium:bg-native-accent-soft android:max-medium:text-native-button/native-button android:max-medium:font-native-button android:max-medium:text-foreground desktop:rounded-shadcn-control desktop:px-md desktop:text-label desktop:min-block-pointer-button"
    onclick={onClear}
  >
    {m.storage_clear()}
  </Button>
</div>
