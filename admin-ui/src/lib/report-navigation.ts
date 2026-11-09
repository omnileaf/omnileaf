import type { Query } from "#lib/reports-query.ts";

export interface ReportsNavigation {
  readonly goto: (
    url: string,
    options: { readonly replace: boolean; readonly reset: boolean },
  ) => Promise<unknown>;
  readonly resolve: (path: `/reports${Query}`) => string;
}

const REPLACE_WITHOUT_RESETTING_FOCUS = { replace: true, reset: false };

export function replaceReportsQuery(
  navigation: ReportsNavigation,
  query: Query,
): Promise<unknown> {
  return navigation.goto(
    navigation.resolve(`/reports${query}`),
    REPLACE_WITHOUT_RESETTING_FOCUS,
  );
}
