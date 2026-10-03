import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { expect, onTestFinished, test } from "vitest";

import { isRecord } from "./json.ts";
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

async function serverShowingABlankPage(): Promise<URL> {
  const server = createServer((request: IncomingMessage, response) => {
    request.resume();
    const route = `${request.method ?? ""} ${request.url ?? ""}`;
    if (route in BLANK_PAGE) {
      reply(response, 200, BLANK_PAGE[route]);
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
  const session = await Session.start(await serverShowingABlankPage(), {});

  const wait = session.waitFor(xpath("//h1"), 50);

  await expect(wait).rejects.toThrow(
    'the element at //h1 was not ready within 50 ms; the page at about:blank titled "" shows no text',
  );
});

test("reloads the page and waits for the fresh one", async () => {
  const requests: string[] = [];
  let finds = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body: unknown =
        chunks.length === 0
          ? null
          : JSON.parse(Buffer.concat(chunks).toString());
      const sent = isRecord(body) ? (body.script ?? body.value) : undefined;
      requests.push(`${request.url ?? ""} ${String(sent)}`);
      if (request.url === "/session") {
        reply(response, 200, { sessionId: "blank" });
      } else if (request.url === "/session/blank/element" && finds++ === 0) {
        reply(response, 404, { error: "no such element", message: "" });
      } else {
        reply(response, 200, { [ELEMENT_KEY]: "fresh" });
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
  const session = await Session.start(
    new URL(`http://127.0.0.1:${String(port)}/`),
    {},
  );

  await session.reload();

  expect(requests.slice(1)).toEqual([
    "/session/blank/execute/sync document.documentElement.dataset.e2eReloading = ''; setTimeout(() => location.reload()); return null;",
    "/session/blank/element /html[not(@data-e2e-reloading)]",
    "/session/blank/element /html[not(@data-e2e-reloading)]",
  ]);
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
