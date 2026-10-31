<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { emptyLook } from "#lib/components/ui/empty/looks.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";

  import { WindowWidth } from "./breakpoints";
  import type { Glyph } from "./glyph";
  import { currentPlatform, phoneOf } from "./platform";

  let {
    icon: Icon,
    title,
    body,
    role,
    children,
  }: {
    icon: Glyph;
    title: string;
    body: string;
    role?: "alert";
    children?: Snippet;
  } = $props();

  const ICON_SIZE = 24;
  const ANDROID_ICON_SIZE = 48;
  const ANDROID_TITLE =
    "text-native-empty/native-empty tracking-native-empty font-normal";

  const titleId = $props.id();
  const look = emptyLook(currentPlatform());
  const width = new WindowWidth();
  const android = {
    get isOn(): boolean {
      return phoneOf(currentPlatform(), width.current) === "android";
    },
  };
</script>

<Empty
  aria-labelledby={titleId}
  {role}
  class="flex-1 justify-center px-xl pbe-empty-lift"
>
  <EmptyMedia
    class={android.isOn
      ? "bg-transparent text-muted block-auto inline-auto"
      : ""}
  >
    {#if android.isOn}
      <Icon size={ANDROID_ICON_SIZE} />
    {:else}
      <Icon size={ICON_SIZE} class="block-empty-icon inline-empty-icon" />
    {/if}
  </EmptyMedia>
  <EmptyTitle id={titleId} class={android.isOn ? ANDROID_TITLE : ""}>
    {title}
  </EmptyTitle>
  <EmptyDescription
    class={android.isOn
      ? [ROW_SUBTITLE_TYPE, "text-muted", look.prose]
      : ["text-small", look.prose]}
  >
    {body}
  </EmptyDescription>
  {@render children?.()}
</Empty>
