import { Info, TriangleAlert } from "@lucide/svelte";
import { expect, test } from "vitest";
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
