import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { expect, onTestFinished, test } from "vitest";

import { describePage, Session, xpath } from "./webdriver.ts";

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

const BLANK_PAGE: Readonly<Record<string, unknown>> = {
  "POST /session": { sessionId: "blank" },
  "GET /session/blank/url": "about:blank",
  "GET /session/blank/title": "",
  "POST /session/blank/execute/sync": "",
};

function reply(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ value }));
}

type Handler = (route: string, response: ServerResponse) => void;

async function serve(handle: Handler): Promise<URL> {
  const server = createServer((request: IncomingMessage, response) => {
    request.resume();
    handle(`${request.method ?? ""} ${request.url ?? ""}`, response);
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

function serverShowingABlankPage(): Promise<URL> {
  return serve((route, response) => {
    if (route in BLANK_PAGE) {
      reply(response, 200, BLANK_PAGE[route]);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
}

test("says what the page shows when an element never appears", async () => {
  const session = await Session.start(await serverShowingABlankPage(), {});

  const wait = session.waitFor(xpath("//h1"), 50);

  await expect(wait).rejects.toThrow(
    'the element at //h1 was not ready within 50 ms; the page at about:blank titled "" shows no text',
  );
});

test("reloads the page and waits for the fresh one", async () => {
  const OLD_PAGE_LOOKUPS = 2;
  let scriptsRun = 0;
  let lookups = 0;
  const server = await serve((route, response) => {
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "blank" });
    } else if (route === "POST /session/blank/execute/sync") {
      scriptsRun += 1;
      reply(response, 200, null);
    } else if (++lookups <= OLD_PAGE_LOOKUPS) {
      reply(response, 404, { error: "no such element", message: "" });
    } else {
      reply(response, 200, { [ELEMENT_KEY]: "fresh" });
    }
  });
  const session = await Session.start(server, {});

  await session.reload();

  expect({ scriptsRun, lookups }).toEqual({
    scriptsRun: 1,
    lookups: OLD_PAGE_LOOKUPS + 1,
  });
});

test("waits until a script run in the page says what it waits for holds", async () => {
  const FALSE_ANSWERS = 2;
  let runs = 0;
  const server = await serve((route, response) => {
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "blank" });
    } else if (route === "POST /session/blank/execute/sync") {
      runs += 1;
      reply(response, 200, runs > FALSE_ANSWERS);
    } else {
      reply(response, 404, { error: "unknown command", message: "" });
    }
  });
  const session = await Session.start(server, {});

  await session.waitUntil("return true;", "the covers");

  expect(runs).toBe(FALSE_ANSWERS + 1);
});

test("says what it waited for when a script never says it holds", async () => {
  const session = await Session.start(await serverShowingABlankPage(), {});

  const wait = session.waitUntil("return false;", "the covers", 50);

  await expect(wait).rejects.toThrow(
    'the covers was not ready within 50 ms; the page at about:blank titled "" shows no text',
  );
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
