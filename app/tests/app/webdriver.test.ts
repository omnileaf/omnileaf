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

type Handler = (route: string, response: ServerResponse, body: string) => void;

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
        handle(route, response, body);
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

function serverReplacingItsElementOnce(
  staleRoute: string,
  answers: Readonly<Record<string, unknown>>,
  requests: string[] = [],
): Promise<URL> {
  let lookups = 0;
  return serve((route, response) => {
    requests.push(route);
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "replaced" });
    } else if (route === "POST /session/replaced/elements") {
      lookups += 1;
      reply(response, 200, [{ [ELEMENT_KEY]: lookups === 1 ? "old" : "new" }]);
    } else if (route.endsWith("/displayed")) {
      reply(response, 200, true);
    } else if (route === staleRoute) {
      reply(response, 404, { error: "stale element reference", message: "" });
    } else if (route in answers) {
      reply(response, 200, answers[route]);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
}

test("reads the text of the match that replaced one removed after it was found", async () => {
  const session = await Session.start(
    await serverReplacingItsElementOnce(
      "GET /session/replaced/element/old/text",
      { "GET /session/replaced/element/new/text": "Found 3 books" },
    ),
    {},
  );
  const element = await session.waitFor(xpath("//p"));

  const text = await element.text();

  expect(text).toBe("Found 3 books");
});

test("clicks the match that replaced one removed after it was found", async () => {
  const requests: string[] = [];
  const session = await Session.start(
    await serverReplacingItsElementOnce(
      "POST /session/replaced/element/old/click",
      { "POST /session/replaced/element/new/click": null },
      requests,
    ),
    {},
  );
  const element = await session.waitFor(xpath("//button"));

  await element.click();

  expect(requests).toContain("POST /session/replaced/element/new/click");
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
  const session = await Session.start(await serverShowing(BLANK_PAGE), {});

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

/** Serves a page in the web view's context that records each context it is switched to. */
async function serverSwitchingContexts(switched: string[]): Promise<URL> {
  return serve((route, response) => {
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "contexts" });
    } else if (route === "GET /session/contexts/appium/context") {
      reply(response, 200, "WEBVIEW_1");
    } else if (route === "POST /session/contexts/appium/context") {
      switched.push("switch");
      reply(response, 200, null);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
}

test("runs steps in the native context and comes back to the page's", async () => {
  const switched: string[] = [];
  const session = await Session.start(
    await serverSwitchingContexts(switched),
    {},
  );

  const answer = await session.inNativeContext(() => {
    switched.push("step");
    return Promise.resolve("picked");
  });

  expect(answer).toBe("picked");
  expect(switched).toEqual(["switch", "step", "switch"]);
});

test("comes back to the page's context when a native step fails", async () => {
  const switched: string[] = [];
  const session = await Session.start(
    await serverSwitchingContexts(switched),
    {},
  );

  const steps = session.inNativeContext(() =>
    Promise.reject(new Error("the picker never opened")),
  );

  await expect(steps).rejects.toThrow("the picker never opened");
  expect(switched).toEqual(["switch", "switch"]);
});

test("relaunches the app and goes on in the web view of the new launch, not the old one", async () => {
  const switchedTo: unknown[] = [];
  let contextsAsked = 0;
  const server = await serve((route, response, body) => {
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "relaunch" });
    } else if (route === "GET /session/relaunch/appium/context") {
      reply(response, 200, "WEBVIEW_1");
    } else if (route === "GET /session/relaunch/contexts") {
      contextsAsked += 1;
      reply(
        response,
        200,
        contextsAsked < 3
          ? ["NATIVE_APP", "WEBVIEW_1"]
          : ["NATIVE_APP", "WEBVIEW_1", "WEBVIEW_2"],
      );
    } else if (route === "POST /session/relaunch/appium/context") {
      switchedTo.push(JSON.parse(body));
      reply(response, 200, null);
    } else if (route === "POST /session/relaunch/execute/sync") {
      reply(response, 200, null);
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
  const session = await Session.start(server, {});

  await session.relaunchApp("app.example");

  expect(switchedTo).toEqual([{ name: "WEBVIEW_2" }]);
});

test("reports a failed native step, not the failed return from it", async () => {
  let switches = 0;
  const server = await serve((route, response) => {
    if (route === "POST /session") {
      reply(response, 200, { sessionId: "lost" });
    } else if (route === "GET /session/lost/appium/context") {
      reply(response, 200, "WEBVIEW_1");
    } else if (route === "POST /session/lost/appium/context") {
      switches += 1;
      if (switches === 1) {
        reply(response, 200, null);
      } else {
        reply(response, 500, {
          error: "unknown error",
          message: "the web view is gone",
        });
      }
    } else {
      reply(response, 404, { error: "no such element", message: "" });
    }
  });
  const session = await Session.start(server, {});

  const steps = session.inNativeContext(() =>
    Promise.reject(new Error("the picker never opened")),
  );

  await expect(steps).rejects.toThrow("the picker never opened");
});
