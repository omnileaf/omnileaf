/** Opens the menu from the keyboard ourselves, since WebKit sends no contextmenu event for Shift F10 or the Menu key. */
export function openMenuFromKeys(event: KeyboardEvent): void {
  const isMenuKey =
    event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
  if (!isMenuKey || !(event.target instanceof HTMLElement)) {
    return;
  }
  event.preventDefault();
  const box = event.target.getBoundingClientRect();
  event.target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  );
}
