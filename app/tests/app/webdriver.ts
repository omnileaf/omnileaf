import { isRecord } from "./json.ts";

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const NO_SUCH_ELEMENT = "no such element";
const ELEMENT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SESSION_START_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 100;
const WHITESPACE_RUN = /\s+/g;
const PAGE_TEXT_SHOWN = 200;
const PAGE_TEXT_SCRIPT = "return document.body ? document.body.innerText : '';";

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    return new Session(new URL(`session/${id}`, server).href);
  }

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

  async end(): Promise<void> {
    await send(this.endpoint, "DELETE");
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
    try {
      const found = await send(`${this.endpoint}/element`, "POST", locator);
      const id = requireString(property(found, ELEMENT_KEY), "element id");
      return { text: () => this.textOf(id), click: () => this.clickOn(id) };
    } catch (error) {
      if (error instanceof WebDriverError && error.code === NO_SUCH_ELEMENT) {
        return undefined;
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
