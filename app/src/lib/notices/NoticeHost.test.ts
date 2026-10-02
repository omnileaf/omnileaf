import { Info, TriangleAlert } from "@lucide/svelte";
import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import NoticeHost from "./NoticeHost.svelte";
import { type Notice, Notices } from "./notices.svelte";

const INFO: Notice = {
  tone: "info",
  icon: Info,
  title: "Sample Library is ready",
  body: "Every comic in it can be read now.",
  actions: [],
};

const WARNING: Notice = {
  tone: "warning",
  icon: TriangleAlert,
  title: "Sample Library isn't available",
  body: "Your progress is safe.",
  actions: [],
};

const placed: HTMLElement[] = [];

afterEach(() => {
  for (const element of placed.splice(0)) {
    element.remove();
  }
});

function placeOnPage<Tag extends "button" | "main">(
  tag: Tag,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  document.body.append(element);
  placed.push(element);
  return element;
}

function placePageHeading(): HTMLHeadingElement {
  const heading = document.createElement("h1");
  heading.tabIndex = -1;
  placeOnPage("main").append(heading);
  return heading;
}

async function renderHost() {
  const notices = new Notices();
  const screen = await render(NoticeHost, { notices });
  return {
    notices,
    screen,
    status: screen.getByRole("status"),
    alert: screen.getByRole("alert"),
  };
}

test("announces an info notice without interrupting", async () => {
  const { notices, status, alert } = await renderHost();

  notices.show(INFO);

  await expect
    .element(status)
    .toHaveTextContent(
      "Sample Library is ready Every comic in it can be read now.",
    );
  await expect.element(alert).toBeEmptyDOMElement();
});

test("announces a warning as an alert", async () => {
  const { notices, status, alert } = await renderHost();

  notices.show(WARNING);

  await expect
    .element(alert)
    .toHaveTextContent("Sample Library isn't available Your progress is safe.");
  await expect.element(status).toBeEmptyDOMElement();
});

test("shows only the newest notice", async () => {
  const { notices, status, alert } = await renderHost();
  notices.show(WARNING);

  notices.show(INFO);

  await expect
    .element(status)
    .toHaveTextContent(
      "Sample Library is ready Every comic in it can be read now.",
    );
  await expect.element(alert).toBeEmptyDOMElement();
});

test("puts the notice away when it's dismissed", async () => {
  const { notices, screen, alert } = await renderHost();
  notices.show(WARNING);

  await screen.getByRole("button", { name: "Dismiss" }).click();

  await expect.element(alert).toBeEmptyDOMElement();
});

test("runs an action and puts the notice away", async () => {
  const { notices, screen, alert } = await renderHost();
  let timesRun = 0;
  notices.show({
    ...WARNING,
    actions: [
      { label: "Show them anyway", emphasis: "quiet", run: () => undefined },
      {
        label: "Find the folder",
        emphasis: "primary",
        run: () => {
          timesRun += 1;
        },
      },
    ],
  });

  await screen.getByRole("button", { name: "Find the folder" }).click();

  expect(timesRun).toBe(1);
  await expect.element(alert).toBeEmptyDOMElement();
});

test("returns focus to where it came from once dismissed", async () => {
  const origin = placeOnPage("button");
  const { notices, screen } = await renderHost();
  notices.show(WARNING);
  origin.focus();
  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Dismiss" }))
    .toHaveFocus();

  await userEvent.keyboard("{Enter}");

  expect(document.activeElement).toBe(origin);
});

test("returns focus to the page heading once an action runs, if where it came from has gone", async () => {
  const heading = placePageHeading();
  const origin = placeOnPage("button");
  const { notices, screen } = await renderHost();
  notices.show({
    ...WARNING,
    actions: [
      { label: "Find the folder", emphasis: "primary", run: () => undefined },
    ],
  });
  origin.focus();
  await userEvent.tab();
  origin.remove();
  screen.getByRole("button", { name: "Find the folder" }).element().focus();

  await userEvent.keyboard("{Enter}");

  expect(document.activeElement).toBe(heading);
});
