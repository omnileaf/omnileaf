<script lang="ts">
  import { WindowWidth } from "./breakpoints";
  import { currentPlatform, isPhone } from "./platform";
  import { NATIVE_TOP_BAR } from "./top-bar";

  let { title, size = "page" }: { title: string; size?: "page" | "large" } =
    $props();

  const TODAYS_TITLE =
    "text-page-title font-bold tracking-tight android:font-regular android:tracking-normal in-toolbar:truncate in-toolbar:text-body in-toolbar:font-semibold in-toolbar:tracking-normal";

  const platform = currentPlatform();
  const width = new WindowWidth();
  const look = $derived(
    isPhone(platform, width.current)
      ? size === "large"
        ? NATIVE_TOP_BAR.largeTitle
        : NATIVE_TOP_BAR.pageTitle
      : TODAYS_TITLE,
  );
</script>

<h1
  tabindex="-1"
  class={[
    "wrap-break-word touch:max-medium:ps-xs heading-stacked:wrap-anywhere",
    look,
  ]}
>
  {title}
</h1>
