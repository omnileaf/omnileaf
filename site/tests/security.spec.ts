import { expect, test } from "@playwright/test";

const SECURITY_TXT = `Contact: mailto:security@omnileaf.app
Expires: 2027-10-13T00:00:00.000Z
Preferred-Languages: en
Canonical: https://omnileaf.app/.well-known/security.txt
Policy: https://omnileaf.app/#security
`;

test("serves security.txt as plain text", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  expect(await response.text()).toBe(SECURITY_TXT);
});
