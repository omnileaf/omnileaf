/** A script that says whether the page is shown, its image loaded from the omni protocol and decoded. */
export function pageShownScript(page: number): string {
  return `return [...document.images].some((image) => image.alt === "Page ${String(page)}" && image.complete && image.naturalWidth > 0 && !image.classList.contains("invisible") && image.getAttribute("aria-hidden") === null);`;
}
