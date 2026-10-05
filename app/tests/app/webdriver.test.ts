import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { expect, onTestFinished, test } from "vitest";

import { describePage, Session, xpath } from "./webdriver.ts";

const BLANK_PAGE: Readonly<Record<string, unknown>> = {
  "POST /session": { sessionId: "blank" },
  "GET /session/blank/url": "about:blank",
  "GET /session/blank/title": "",
  "POST /session/blank/execute/sync": "",
  "POST /session/blank/elements": [],
};

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

const PAGE_WITH_A_HIDDEN_DUPLICATE: Readonly<Record<string, unknown>> = {
  "POST /session": { sessionId: "duplicates" },
  "POST /session/duplicates/elements": [
    { [ELEMENT_KEY]: "hidden" },
    { [ELEMENT_KEY]: "shown" },
  ],
  "GET /session/duplicates/element/hidden/displayed": false,
  "GET /session/duplicates/element/shown/displayed": true,
  "GET /session/duplicates/element/hidden/text": "About",
  "GET /session/duplicates/element/shown/text": "About Version 1.2.3",
};

function reply(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ value }));
}

async function serverShowing(
  page: Readonly<Record<string, unknown>>,
  failures: Readonly<Record<string, string>> = {},
): Promise<URL> {
  const server = createServer((request: IncomingMessage, response) => {
    request.resume();
    const route = `${request.method ?? ""} ${request.url ?? ""}`;
    const failure = failures[route];
    if (failure !== undefined) {
      reply(response, 404, { error: failure, message: "" });
    } else if (route in page) {
      reply(response, 200, page[route]);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(
    () =>
      new Promise((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  );
  const { port } = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${String(port)}/`);
}

test("says what the page shows when an element never appears", async () => {
  const session = await Session.start(await serverShowing(BLANK_PAGE), {});

  const wait = session.waitFor(xpath("//h1"), 50);

  await expect(wait).rejects.toThrow(
    'the element at //h1 was not ready within 50 ms; the page at about:blank titled "" shows no text',
  );
});

test("passes over a hidden match for the one the page shows", async () => {
  const session = await Session.start(
    await serverShowing(PAGE_WITH_A_HIDDEN_DUPLICATE),
    {},
  );

  const element = await session.waitFor(xpath("//a"));

  expect(await element.text()).toBe("About Version 1.2.3");
});

test("passes over a match that is removed while it is checked", async () => {
  const session = await Session.start(
    await serverShowing(PAGE_WITH_A_HIDDEN_DUPLICATE, {
      "GET /session/duplicates/element/hidden/displayed":
        "stale element reference",
    }),
    {},
  );

  const element = await session.waitFor(xpath("//a"));

  expect(await element.text()).toBe("About Version 1.2.3");
});

test("describes the page by its address, title and text", () => {
  const description = describePage({
    url: "http://tauri.localhost/",
    title: "Omnileaf",
    text: "Library\n\nVersion 0.0.0",
  });

  expect(description).toBe(
    'the page at http://tauri.localhost/ titled "Omnileaf" shows "Library Version 0.0.0"',
  );
});

test("says when the page shows no text", () => {
  const description = describePage({
    url: "about:blank",
    title: "",
    text: " \n ",
  });

  expect(description).toBe('the page at about:blank titled "" shows no text');
});

test("shortens long page text", () => {
  const description = describePage({
    url: "http://tauri.localhost/",
    title: "Omnileaf",
    text: "a".repeat(300),
  });

  expect(description).toBe(
    `the page at http://tauri.localhost/ titled "Omnileaf" shows "${"a".repeat(200)}…"`,
  );
});
