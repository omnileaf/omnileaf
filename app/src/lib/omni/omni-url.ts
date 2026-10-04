import { convertFileSrc } from "@tauri-apps/api/core";

const OMNI_SCHEME = "omni";

/** Where the webview loads a path of the app's `omni` protocol from: the protocol's base, which each platform spells its own way, then the path unescaped. */
export function omniUrl(path: string): string {
  return `${convertFileSrc("", OMNI_SCHEME)}${path}`;
}
