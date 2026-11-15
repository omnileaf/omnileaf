<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";

  import {
    ANIMATION_GROUPS,
    getAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import { contrastChoice } from "#lib/page/contrast-choice.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_LIST_HEADING } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  const animations = getAnimationsSetting();
  const systemReducesMotion = new MediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const motionHeadingId = $props.id();

  const isMotionReduced = $derived(
    systemReducesMotion.current ||
      ANIMATION_GROUPS.every((group) => !animations.isOn(group)),
  );

  function reduceMotion(isReduced: boolean): void {
    for (const group of ANIMATION_GROUPS) {
      animations.turn(group, !isReduced);
    }
  }
</script>

<SectionHeading title={m.accessibility_title()} />
<div class="mbs-pane-gap flex flex-col android:max-medium:mbs-none">
  <section aria-labelledby={motionHeadingId} class="flex flex-col">
    <h2 id={motionHeadingId} class={FLUSH_LIST_HEADING}>
      {m.accessibility_motion_and_contrast()}
    </h2>
    <SettingSwitch
      bleeds
      label={m.accessibility_reduce_motion()}
      description={m.accessibility_reduce_motion_help()}
      isOn={isMotionReduced}
      disabled={systemReducesMotion.current}
      onToggle={() => {
        reduceMotion(!isMotionReduced);
      }}
    />
    <SettingSwitch
      bleeds
      label={m.accessibility_higher_contrast()}
      description={m.accessibility_higher_contrast_help()}
      isOn={contrastChoice.isHigher}
      onToggle={() => {
        contrastChoice.choose(!contrastChoice.isHigher);
      }}
    />
  </section>
</div>
