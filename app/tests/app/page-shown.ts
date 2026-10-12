export function pageShownScript(page: number): string {
  return `return [...document.images].some((image) => image.alt === "Page ${String(page)}" && image.complete && image.naturalWidth > 0 && !image.classList.contains("invisible") && image.getAttribute("aria-hidden") === null);`;
}
