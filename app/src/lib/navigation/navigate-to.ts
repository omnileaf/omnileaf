import { goto } from "$app/navigation";

export type NavigationTarget = Parameters<typeof goto>[0];
export type NavigationOptions = NonNullable<Parameters<typeof goto>[1]>;

export interface StartedNavigation {
  readonly href: string;
  readonly options: NavigationOptions | undefined;
  readonly isAcrossOverlays: boolean;
}

const underway = new Map<string, StartedNavigation>();

function start(
  target: NavigationTarget,
  options: NavigationOptions | undefined,
  isAcrossOverlays: boolean,
): Promise<void> {
  const href = new URL(target, location.href).href;
  const navigation = { href, options, isAcrossOverlays };
  underway.set(href, navigation);
  const forget = (): void => {
    if (underway.get(href) === navigation) {
      underway.delete(href);
    }
  };
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers resolve the target
  const going = goto(target, options);
  going.then(forget, forget);
  return going;
}

/** SvelteKit tells `beforeNavigate` where a `goto` is headed, a moment after the call and without its options, so a navigation held back first has to carry them itself. */
export function navigateTo(
  target: NavigationTarget,
  options?: NavigationOptions,
): Promise<void> {
  return start(target, options, false);
}

export function navigateAcrossOverlays(
  target: NavigationTarget,
  options?: NavigationOptions,
): Promise<void> {
  return start(target, options, true);
}

export function navigationStartedTo(to: URL): StartedNavigation | undefined {
  return underway.get(to.href);
}

function linkOption(link: Element, name: string): boolean | undefined {
  const value = link
    .closest(`[data-sveltekit-${name}]`)
    ?.getAttribute(`data-sveltekit-${name}`);
  if (value === undefined || value === null) {
    return undefined;
  }
  return value !== "off" && value !== "false";
}

export function optionsOfLinkClick(
  event: Event | undefined,
): NavigationOptions | undefined {
  const link =
    event?.target instanceof Element ? event.target.closest("a") : null;
  if (link === null) {
    return undefined;
  }
  const replace = linkOption(link, "replacestate");
  const reset = linkOption(link, "reset");
  const options: NavigationOptions = {
    ...(replace === undefined ? {} : { replace }),
    ...(reset === undefined ? {} : { reset }),
  };
  return Object.keys(options).length === 0 ? undefined : options;
}
