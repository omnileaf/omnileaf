<script lang="ts">
  import { WindowWidth } from "./breakpoints";
  import { commandBarLook } from "./command-bar-look";
  import { currentPlatform, isPhone } from "./platform";
  import { hasLargeTitle, NATIVE_TOP_BAR } from "./top-bar";

  let { title, size = "page" }: { title: string; size?: "page" | "large" } =
    $props();

  const TODAYS_TITLE =
    "text-page-title font-bold tracking-tight android:font-regular android:tracking-normal in-toolbar:truncate in-toolbar:text-body in-toolbar:font-semibold in-toolbar:tracking-normal";

  const platform = currentPlatform();
  const width = new WindowWidth();

  function titleLook() {
    const bar = commandBarLook(platform);
    if (bar !== undefined) {
      return bar.title;
    }
    const isLarge = size === "large" && hasLargeTitle(platform, width.current);
    if (isPhone(platform, width.current) || isLarge) {
      return [
        size === "large" ? NATIVE_TOP_BAR.largeTitle : NATIVE_TOP_BAR.pageTitle,
        "wrap-anywhere",
      ];
    }
    return TODAYS_TITLE;
  }

  const look = $derived(titleLook());
</script>

<h1
  tabindex="-1"
  class={["touch:max-medium:ps-xs heading-stacked:wrap-anywhere", look]}
>
  {title}
</h1>
