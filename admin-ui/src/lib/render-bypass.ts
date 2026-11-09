const SERVER_RENDERER = /["']svelte\/(?:internal\/)?server["']/;

export function bypassesRenderPage(source: string): boolean {
  return SERVER_RENDERER.test(source);
}
