<script lang="ts">
  import { Folder, Lock, Sparkles } from "@lucide/svelte";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import WidthWording from "#lib/page/WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "#lib/page/wording.ts";
  import { m } from "#lib/paraglide/messages.js";

  import AppIcon from "./AppIcon.svelte";
  import type { DeviceKind } from "./device";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";
  import { welcomeStepLook } from "./welcome-step-look.ts";

  const PROMISE_ICON_SIZE = 20;

  const look = welcomeStepLook(currentPlatform());

  let { device, onNext }: { device: DeviceKind; onNext: () => void } = $props();

  const BODY = {
    phone: {
      onPhones: m.first_launch_welcome_body_phone,
      fromMedium: m.first_launch_welcome_body_tablet,
    },
    desktop: atEveryWidth(m.first_launch_welcome_body_desktop),
  } satisfies Record<DeviceKind, WordingByWidth>;

  interface WelcomePromise {
    readonly icon: typeof Folder;
    readonly iconName: IconName;
    readonly title: () => string;
    readonly detail: WordingByWidth;
  }

  const PROMISES = {
    phone: [
      {
        icon: Folder,
        iconName: "folder",
        title: m.first_launch_promise_folders,
        detail: atEveryWidth(m.first_launch_promise_folders_detail_phone),
      },
      {
        icon: Sparkles,
        iconName: "sparkles",
        title: m.first_launch_promise_reading,
        detail: atEveryWidth(m.first_launch_promise_reading_detail_phone),
      },
      {
        icon: Lock,
        iconName: "lock",
        title: m.first_launch_promise_private_phone,
        detail: {
          onPhones: m.first_launch_promise_private_detail_phone,
          fromMedium: m.first_launch_promise_private_detail_tablet,
        },
      },
    ],
    desktop: [
      {
        icon: Folder,
        iconName: "folder",
        title: m.first_launch_promise_folders,
        detail: atEveryWidth(m.first_launch_promise_folders_detail_desktop),
      },
      {
        icon: Sparkles,
        iconName: "sparkles",
        title: m.first_launch_promise_reading,
        detail: atEveryWidth(m.first_launch_promise_reading_detail_desktop),
      },
      {
        icon: Lock,
        iconName: "lock",
        title: m.first_launch_promise_private_desktop,
        detail: atEveryWidth(m.first_launch_promise_private_detail_desktop),
      },
    ],
  } satisfies Record<DeviceKind, readonly WelcomePromise[]>;
</script>

<StepFrame step="welcome">
  <StepHeader scale="welcome">
    {#snippet badge()}
      <div class={["flex pbe-sm", look.badge]}>
        <AppIcon class={look.appIcon} />
      </div>
    {/snippet}
    {m.first_launch_welcome_title()}
    {#snippet lead()}
      <WidthWording wording={BODY[device]} />
    {/snippet}
  </StepHeader>
  <ul class={["mbs-sm flex flex-col", look.promises]}>
    {#each PROMISES[device] as promise (promise.title)}
      <li class={["flex", look.promise]}>
        <span
          class={["flex shrink-0 items-center justify-center", look.marker]}
        >
          {#if look.usesMaterialIcons}
            <Icon name={promise.iconName} />
          {:else}
            <promise.icon size={PROMISE_ICON_SIZE} aria-hidden="true" />
          {/if}
        </span>
        <span class="flex flex-col">
          <span class={look.title}>{promise.title()}</span>
          <span class={["text-muted", look.detail]}>
            <WidthWording wording={promise.detail} />
          </span>
        </span>
      </li>
    {/each}
  </ul>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_get_started()}
    </StepButton>
  {/snippet}
</StepFrame>
