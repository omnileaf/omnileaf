import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { Notices } from "#lib/notices/notices.svelte.ts";

import Page from "./+page.svelte";

const PROPS = {
  data: {
    appInfo: {
      version: "1.2.3",
      platform: "linux" as const,
      sourceCode: "repo.example.org/omnileaf",
      isDevelopmentBuild: false,
    },
    isFirstLaunch: false,
    libraryProblem: null,
    notices: new Notices(),
  },
  params: {},
};

test("shows the app version it was given", async () => {
  const screen = await render(Page, PROPS);

  await expect.element(screen.getByText("Version 1.2.3")).toBeVisible();
});
