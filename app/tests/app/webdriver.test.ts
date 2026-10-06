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
  "POST /session/blank/elements": [],
};

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

type Handler = (route: string, response: ServerResponse) => void;

const SESSION_TIMEOUTS = /^POST \/session\/[^/]+\/timeouts$/;

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString();
}

/** Serves `handle`'s routes, answering every session's timeouts itself and recording each one set in `timeoutsSet`. */
async function serve(
  handle: Handler,
  timeoutsSet: unknown[] = [],
): Promise<URL> {
  const server = createServer((request: IncomingMessage, response) => {
    const route = `${request.method ?? ""} ${request.url ?? ""}`;
    void bodyOf(request).then((body) => {
      if (SESSION_TIMEOUTS.test(route)) {
        timeoutsSet.push(JSON.parse(body));
        reply(response, 200, null);
      } else {
        handle(route, response);
      }
    });
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

function serverShowing(
  page: Readonly<Record<string, unknown>>,
  failures: Readonly<Record<string, string>> = {},
): Promise<URL> {
  return serve((route, response) => {
    const failure = failures[route];
    if (failure !== undefined) {
      reply(response, 404, { error: failure, message: "" });
    } else if (route in page) {
      reply(response, 200, page[route]);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
}

test("says what the page shows when an element never appears", async () => {
  const session = await Session.start(await serverShowing(BLANK_PAGE), {});

  const wait = session.waitFor(xpath("//h1"), 50);

  await expect(wait).rejects.toThrow(
    'the element at //h1 was not ready within 50 ms; the page at about:blank titled "" shows no text',
  );
});

test("reloads the page and waits for the fresh one", async () => {
  const OLD_PAGE_CHECKS = 2;
  let scriptsRun = 0;
  const server = await serve((route, response) => {
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "blank" });
    } else if (route === "POST /session/blank/execute/sync") {
      scriptsRun += 1;
      const isReloadScript = scriptsRun === 1;
      const isOldPage = scriptsRun <= 1 + OLD_PAGE_CHECKS;
      reply(response, 200, isReloadScript ? null : !isOldPage);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
  const session = await Session.start(server, {});

  await session.reload();

  expect(scriptsRun).toBe(1 + OLD_PAGE_CHECKS + 1);
});

test("gives up on a script after two seconds, so a page that unloads mid-script can't hold the session", async () => {
  const timeoutsSet: unknown[] = [];
  const server = await serve((_route, response) => {
    reply(response, 200, { sessionId: "blank" });
  }, timeoutsSet);

  await Session.start(server, {});

  expect(timeoutsSet).toEqual([{ script: 2_000 }]);
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
