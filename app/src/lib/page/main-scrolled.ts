export function watchMainScrolled(
  onChange: (isScrolled: boolean) => void,
): () => void {
  const main = document.querySelector("main");
  if (main === null) {
    return () => undefined;
  }
  const report = (): void => {
    onChange(main.scrollTop > 0);
  };
  report();
  main.addEventListener("scroll", report, { passive: true });
  return () => {
    main.removeEventListener("scroll", report);
  };
}
