export function watchScrolled(
  scroller: HTMLElement,
  onChange: (isScrolled: boolean) => void,
): () => void {
  const report = (): void => {
    onChange(scroller.scrollTop > 0);
  };
  report();
  scroller.addEventListener("scroll", report, { passive: true });
  return () => {
    scroller.removeEventListener("scroll", report);
  };
}
