import type { PageLoad } from "./$types";

export const load = (async ({ parent }) => {
  const { session } = await parent();
  return { csrf: session.ok ? session.value.csrf : undefined };
}) satisfies PageLoad;
