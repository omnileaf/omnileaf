<script lang="ts">
  import { WindowWidth } from "./breakpoints";
  import { currentPlatform, isPhone } from "./platform";
  import { NATIVE_TOP_BAR } from "./top-bar";

  let { title, size = "page" }: { title: string; size?: "page" | "large" } =
    $props();

  const TODAYS_TITLE =
    "text-page-title font-bold tracking-tight android:font-regular android:tracking-normal in-toolbar:truncate in-toolbar:text-body in-toolbar:font-semibold in-toolbar:tracking-normal";

  const WINDOWS_TITLE =
    "text-native-page-title leading-native-page-title font-native-page-title tracking-native-page-title text-native-on-top-bar in-toolbar:truncate";

  const platform = currentPlatform();
  const width = new WindowWidth();

  function titleLook() {
    if (platform === "windows") {
      return WINDOWS_TITLE;
    }
    if (isPhone(platform, width.current)) {
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
