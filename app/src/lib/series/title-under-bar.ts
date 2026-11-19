export function watchTitleUnderBar(
  barBottom: number,
  onChange: (isUnderBar: boolean) => void,
): () => void {
  const title = document.querySelector("main h1");
  if (title === null) {
    return () => undefined;
  }
  const watching = new IntersectionObserver(
    ([seen]) => {
      if (seen !== undefined) {
        onChange(
          !seen.isIntersecting &&
            seen.boundingClientRect.bottom <= (seen.rootBounds?.top ?? 0),
        );
      }
    },
    { rootMargin: `${String(-barBottom)}px 0px 0px 0px` },
  );
  watching.observe(title);
  return () => {
    watching.disconnect();
  };
}
