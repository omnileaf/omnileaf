import { resolve } from "$app/paths";
import { expect, test } from "vitest";

import { creatorRoute } from "./creator-route";

test("links to a creator's page with their name kept whole", () => {
  expect(resolve("/(app)/creator/[name]", creatorRoute("Author A/B"))).toBe(
    "/creator/Author%20A%2FB",
  );
});
