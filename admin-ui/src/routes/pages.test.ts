import type { Component } from "svelte";
import { beforeEach, expect, test, vi } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { renderPage } from "#lib/components/ui/render.ts";
import { ReportsStore } from "#lib/reports-store.svelte.ts";
import RouteHarness from "#lib/route-harness.svelte";
import { aCode, aListed } from "#lib/testing.ts";
import type { ReportList } from "#lib/wire.ts";

import DashboardPage from "./+page.svelte";
import ReportPage from "./reports/[code]/+page.svelte";
import ReportsPage from "./reports/+page.svelte";

const address = vi.hoisted(
  (): { url: URL; params: Record<string, string> } => ({
    url: new URL("http://localhost/admin/reports"),
    params: {},
  }),
);

vi.mock("$app/state", () => ({ page: address }));
vi.mock("$app/navigation", () => ({
  afterNavigate: vi.fn(),
  goto: vi.fn(() => Promise.resolve()),
}));

const OPEN = aListed({ code: aCode("R-1111-1111"), platform: "linux" });
const CLOSED = aListed({
  code: aCode("R-2222-2222"),
  platform: "android",
  status: { kind: "closed" },
});

async function readyStore(): Promise<ReportsStore> {
  const list: ApiResult<ReportList> = {
    ok: true,
    value: { reports: [OPEN, CLOSED], truncated: false },
  };
  const store = new ReportsStore({ reports: () => Promise.resolve(list) });
  await store.reload();
  return store;
}

async function page(route: Component): Promise<string> {
  const store = await readyStore();
  return renderPage(RouteHarness, { route, store }).body.replace(
    /<!--.*?-->/gs,
    "",
  );
}

beforeEach(() => {
  address.url = new URL("http://localhost/admin/reports");
  address.params = {};
});

test("renders the dashboard with its heading and its numbers", async () => {
  const markup = await page(DashboardPage);

  expect(markup).toMatch(/<h1\b[^>]*>\s*Dashboard\s*<\/h1>/);
  expect(markup).toContain("/admin/reports?status=closed");
});

test("renders the reports with their heading and every report", async () => {
  const markup = await page(ReportsPage);

  expect(markup).toMatch(/<h1\b[^>]*>\s*Reports\s*<\/h1>/);
  expect(markup).toContain("<search");
  expect(markup).toContain("R-1111-1111");
  expect(markup).toContain("R-2222-2222");
});

test("renders only the reports the address filters for", async () => {
  address.url = new URL("http://localhost/admin/reports?status=closed");

  const markup = await page(ReportsPage);

  expect(markup).toContain("R-2222-2222");
  expect(markup).not.toContain("R-1111-1111");
  expect(markup).toMatch(/<option\b[^>]*value="closed"[^>]*selected/);
});

test("renders the search of the address in the search box", async () => {
  address.url = new URL("http://localhost/admin/reports?q=R-1111");

  const markup = await page(ReportsPage);

  expect(markup).toMatch(/<input\b[^>]*value="R-1111"/);
  expect(markup).not.toContain("R-2222-2222");
});

test("renders a report page with the code of the address as its heading", async () => {
  address.params = { code: "R-1111-1111" };

  const markup = await page(ReportPage);

  expect(markup).toMatch(/<h1\b[^>]*>\s*R-1111-1111\s*<\/h1>/);
});
