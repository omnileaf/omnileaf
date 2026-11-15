export function creatorRoute(name: string): { name: string } {
  return { name: encodeURIComponent(name) };
}
