import { setTimeout as delay } from "node:timers/promises";

import { isRecord, listOf } from "./json.ts";

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const STALE_ELEMENT = "stale element reference";
const ELEMENT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SCRIPT_TIMEOUT_MS = 2_000;
const SESSION_START_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 100;
const WHITESPACE_RUN = /\s+/g;
const PAGE_TEXT_SHOWN = 200;
const RELOADING_MARK = "data-e2e-reloading";
const RELOAD_SCRIPT =
  "document.documentElement.dataset.e2eReloading = ''; setTimeout(() => location.reload()); return null;";
const PAGE_TEXT_SCRIPT = "return document.body ? document.body.innerText : '';";
const FRESH_PAGE_SCRIPT = `return !document.documentElement.hasAttribute("${RELOADING_MARK}");`;

type Method = "GET" | "POST" | "DELETE";

export type Capabilities = Readonly<Record<string, unknown>>;

export interface Locator {
  readonly using: "css selector" | "xpath";
  readonly value: string;
}

export interface WebElement {
  /** Collapses whitespace, since the desktop driver returns raw `textContent` where the standard returns rendered text. */
  text(): Promise<string>;
  click(): Promise<void>;
}

export class WebDriverError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "WebDriverError";
  }
}

export interface PageState {
  readonly url: string;
  readonly title: string;
  readonly text: string;
}

export function describePage(page: PageState): string {
  const text = page.text.replace(WHITESPACE_RUN, " ").trim();
  const shown =
    text.length > PAGE_TEXT_SHOWN
      ? `"${text.slice(0, PAGE_TEXT_SHOWN)}…"`
      : `"${text}"`;
  return `the page at ${page.url} titled "${page.title}" shows ${text === "" ? "no text" : shown}`;
}

class NotReadyError extends Error {
  override name = "NotReadyError";
}

export function xpath(value: string): Locator {
  return { using: "xpath", value };
}

function property(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected ${what} to be a string`);
  }
  return value;
}

async function send(
  url: URL | string,
  method: Method,
  body?: object,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload: unknown = await response.json();
  const value = property(payload, "value");
  if (!response.ok) {
    const code = property(value, "error");
    const message = property(value, "message");
    throw new WebDriverError(
      typeof code === "string" ? code : `HTTP ${String(response.status)}`,
      typeof message === "string" ? message : "",
    );
  }
  return value;
}

export async function pollUntil<T>(
  attempt: () => Promise<T | undefined>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const result = await attempt();
    if (result !== undefined) {
      return result;
    }
    if (performance.now() > deadline) {
      throw new NotReadyError(
        `${what} was not ready within ${String(timeoutMs)} ms`,
      );
    }
    await delay(POLL_INTERVAL_MS);
  }
}

async function readiness(server: URL): Promise<true | undefined> {
  try {
    const status = await send(new URL("status", server), "GET");
    return property(status, "ready") === true ? true : undefined;
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
}

export async function waitUntilReady(
  server: URL,
  timeoutMs: number,
): Promise<void> {
  await pollUntil(
    () => readiness(server),
    timeoutMs,
    `the WebDriver server at ${server.href}`,
  );
}

export class Session {
  private constructor(private readonly endpoint: string) {}

  static async start(
    server: URL,
    capabilities: Capabilities,
  ): Promise<Session> {
    const created = await send(
      new URL("session", server),
      "POST",
      { capabilities: { alwaysMatch: capabilities } },
      SESSION_START_TIMEOUT_MS,
    );
    const id = requireString(property(created, "sessionId"), "session id");
    const session = new Session(new URL(`session/${id}`, server).href);
    await session.limitScriptsTo(SCRIPT_TIMEOUT_MS);
    return session;
  }

  /** Waits for the first match the page displays, since some layouts keep a hidden copy of a control. */
  async waitFor(
    locator: Locator,
    timeoutMs = ELEMENT_TIMEOUT_MS,
  ): Promise<WebElement> {
    try {
      return await pollUntil(
        () => this.find(locator),
        timeoutMs,
        `the element at ${locator.value}`,
      );
    } catch (error) {
      if (!(error instanceof NotReadyError)) {
        throw error;
      }
      throw new Error(`${error.message}; ${await this.describeCurrentPage()}`, {
        cause: error,
      });
    }
  }

  /** Marks the page and reloads it once the script has returned, then asks the page until one without the mark answers. */
  async reload(): Promise<void> {
    await send(`${this.endpoint}/execute/sync`, "POST", {
      script: RELOAD_SCRIPT,
      args: [],
    });
    await pollUntil(
      () => this.isFreshPage(),
      ELEMENT_TIMEOUT_MS,
      "the reloaded page",
    );
  }

  /** A page that is still unloading can't run the check, which counts as not reloaded yet. */
  private async isFreshPage(): Promise<true | undefined> {
    try {
      const fresh = await send(`${this.endpoint}/execute/sync`, "POST", {
        script: FRESH_PAGE_SCRIPT,
        args: [],
      });
      return fresh === true ? true : undefined;
    } catch (error) {
      if (error instanceof WebDriverError) {
        return undefined;
      }
      throw error;
    }
  }

  /** Runs one of the Appium driver's own `mobile:` commands, which act on the device rather than the page. */
  async runMobileCommand(name: string, options: object): Promise<unknown> {
    return send(`${this.endpoint}/execute/sync`, "POST", {
      script: `mobile: ${name}`,
      args: [options],
    });
  }

  async windows(): Promise<readonly string[]> {
    const handles = await send(`${this.endpoint}/window/handles`, "GET");
    return listOf(handles).map((handle) =>
      requireString(handle, "window handle"),
    );
  }

  async switchToWindow(handle: string): Promise<void> {
    await send(`${this.endpoint}/window`, "POST", { handle });
  }

  async end(): Promise<void> {
    await send(this.endpoint, "DELETE");
  }

  /** A script's answer is lost when its page unloads, and the driver otherwise waits 30 s for it, as long as a test may run. */
  private async limitScriptsTo(timeoutMs: number): Promise<void> {
    await send(`${this.endpoint}/timeouts`, "POST", { script: timeoutMs });
  }

  private async describeCurrentPage(): Promise<string> {
    try {
      const [url, title, text] = await Promise.all([
        send(`${this.endpoint}/url`, "GET"),
        send(`${this.endpoint}/title`, "GET"),
        send(`${this.endpoint}/execute/sync`, "POST", {
          script: PAGE_TEXT_SCRIPT,
          args: [],
        }),
      ]);
      return describePage({
        url: requireString(url, "page address"),
        title: requireString(title, "page title"),
        text: requireString(text, "page text"),
      });
    } catch (error) {
      return `the page could not be read: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async find(locator: Locator): Promise<WebElement | undefined> {
    const found = await send(`${this.endpoint}/elements`, "POST", locator);
    if (!Array.isArray(found)) {
      throw new Error("expected the elements found to be a list");
    }
    for (const element of found) {
      const id = requireString(property(element, ELEMENT_KEY), "element id");
      if (await this.isShown(id)) {
        return { text: () => this.textOf(id), click: () => this.clickOn(id) };
      }
    }
    return undefined;
  }

  private async isShown(element: string): Promise<boolean> {
    try {
      const shown = await send(
        `${this.endpoint}/element/${element}/displayed`,
        "GET",
      );
      return shown === true;
    } catch (error) {
      if (error instanceof WebDriverError && error.code === STALE_ELEMENT) {
        return false;
      }
      throw error;
    }
  }

  private async clickOn(element: string): Promise<void> {
    await send(`${this.endpoint}/element/${element}/click`, "POST", {});
  }

  private async textOf(element: string): Promise<string> {
    const text = await send(`${this.endpoint}/element/${element}/text`, "GET");
    return requireString(text, "element text")
      .replace(WHITESPACE_RUN, " ")
      .trim();
  }
}
