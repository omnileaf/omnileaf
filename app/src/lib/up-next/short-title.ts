const SEPARATOR = " · ";

export function shortTitle(title: string): string {
  const end = title.indexOf(SEPARATOR);
  return end > 0 ? title.slice(0, end) : title;
}
