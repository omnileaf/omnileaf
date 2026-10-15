import { afterEach, describe, expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { type Shortcut, shortcut } from "./shortcut";

const detachments: (() => void)[] = [];
const placed: Element[] = [];

afterEach(() => {
  for (const detach of detachments.splice(0)) {
    detach();
  }
  for (const element of placed.splice(0)) {
    element.remove();
  }
});

function listen(declared: Omit<Shortcut, "run">): () => number {
  let times = 0;
  detachments.push(
    shortcut({
      ...declared,
      run: () => {
        times += 1;
      },
    })(window),
  );
  return () => times;
}

function place<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  document.body.append(element);
  placed.push(element);
  return element;
}

function press(
  init: KeyboardEventInit,
  target: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

const COMMAND_PLATFORMS: readonly Platform[] = ["macos", "ios"];
const CONTROL_PLATFORMS: readonly Platform[] = ["linux", "windows", "android"];

describe.each(COMMAND_PLATFORMS)("on %s", (platform) => {
  test("takes Command as the command key and leaves Ctrl alone", () => {
    const times = listen({ key: "k", command: platform });

    press({ key: "k", metaKey: true });
    press({ key: "k", ctrlKey: true });
    press({ key: "k", metaKey: true, ctrlKey: true });

    expect(times()).toBe(1);
  });
});

describe.each(CONTROL_PLATFORMS)("on %s", (platform) => {
  test("takes Ctrl as the command key and leaves Command alone", () => {
    const times = listen({ key: "k", command: platform });

    press({ key: "k", ctrlKey: true });
    press({ key: "k", metaKey: true });
    press({ key: "k", metaKey: true, ctrlKey: true });

    expect(times()).toBe(1);
  });
});

test("leaves a key held with Ctrl, Command or Alt to whatever else wants it", () => {
  const times = listen({ key: "ArrowRight" });

  press({ key: "ArrowRight", ctrlKey: true });
  press({ key: "ArrowRight", metaKey: true });
  press({ key: "ArrowRight", altKey: true });

  expect(times()).toBe(0);
});

test.each([
  ["held", true, 1],
  ["released", false, 1],
  ["either way", undefined, 2],
])("takes a shortcut with Shift %s", (_case, shift, expected) => {
  const times = listen(
    shift === undefined ? { key: "h" } : { key: "h", shift },
  );

  press({ key: "H", shiftKey: true });
  press({ key: "h" });

  expect(times()).toBe(expected);
});

test("takes a letter in either case", () => {
  const times = listen({ key: "z" });

  press({ key: "z" });
  press({ key: "Z" });

  expect(times()).toBe(2);
});

test("takes the key where the letter sits on a layout without Latin letters", () => {
  const times = listen({ key: "z" });

  press({ key: "я", code: "KeyZ" });

  expect(times()).toBe(1);
});

test("follows the printed letter on a Latin layout that moves it", () => {
  const times = listen({ key: "z" });

  press({ key: "w", code: "KeyZ" });
  press({ key: "z", code: "KeyW" });

  expect(times()).toBe(1);
});

test("takes a named key only by its name", () => {
  const times = listen({ key: "Escape" });

  press({ key: "Escape" });
  press({ key: "Enter" });

  expect(times()).toBe(1);
});

test("stops the browser acting on a key it takes", () => {
  listen({ key: "k" });

  const taken = press({ key: "k" });
  const left = press({ key: "j" });

  expect([taken.defaultPrevented, left.defaultPrevented]).toEqual([
    true,
    false,
  ]);
});

test("leaves a key something else has already taken", () => {
  const times = listen({ key: "Escape" });
  const button = place("button");
  button.addEventListener("keydown", (event) => {
    event.preventDefault();
  });

  press({ key: "Escape" }, button);

  expect(times()).toBe(0);
});

test.each(["input", "textarea", "select"] as const)(
  "leaves keys typed in a %s to it",
  (tag) => {
    const times = listen({ key: "z", command: "linux" });

    press({ key: "z", ctrlKey: true }, place(tag));

    expect(times()).toBe(0);
  },
);

test("leaves keys typed in editable content to it", () => {
  const times = listen({ key: "z", command: "linux" });
  const editor = place("div");
  editor.contentEditable = "true";
  const paragraph = document.createElement("p");
  editor.append(paragraph);

  press({ key: "z", ctrlKey: true }, paragraph);

  expect(times()).toBe(0);
});

test("takes keys pressed on a slider, which types nothing", () => {
  const times = listen({ key: "m" });
  const slider = place("input");
  slider.type = "range";

  press({ key: "m" }, slider);

  expect(times()).toBe(1);
});

test("takes keys typed in a text field when the shortcut asks for them", () => {
  const times = listen({ key: "k", command: "linux", inTextFields: true });

  press({ key: "k", ctrlKey: true }, place("input"));

  expect(times()).toBe(1);
});

test("leaves the arrows and paging keys to a focused slider", () => {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
  const slider = place("input");
  slider.type = "range";
  const times = keys.map((key) => listen({ key, inTextFields: true }));

  for (const key of keys) {
    press({ key }, slider);
  }

  expect(times.map((count) => count())).toEqual([0, 0, 0, 0, 0, 0]);
});

test("leaves Space and Enter to a focused button or link", () => {
  const space = listen({ key: " " });
  const enter = listen({ key: "Enter" });

  press({ key: " " }, place("button"));
  press({ key: "Enter" }, place("button"));
  press({ key: "Enter" }, place("a"));

  expect([space(), enter()]).toEqual([0, 0]);
});

test("takes the keys no focused control acts on", () => {
  const right = listen({ key: "ArrowRight" });
  const escape = listen({ key: "Escape", inTextFields: true });
  const slider = place("input");
  slider.type = "range";

  press({ key: "ArrowRight" }, place("button"));
  press({ key: "Escape" }, slider);

  expect([right(), escape()]).toEqual([1, 1]);
});

test("fires once for a held key when the shortcut ignores repeats", () => {
  const times = listen({ key: "h", ignoresRepeats: true });

  press({ key: "h" });
  press({ key: "h", repeat: true });

  expect(times()).toBe(1);
});

test("fires again for a held key by default", () => {
  const times = listen({ key: "h" });

  press({ key: "h" });
  press({ key: "h", repeat: true });

  expect(times()).toBe(2);
});

test("stops listening once detached", () => {
  const times = listen({ key: "Escape" });
  const detach = detachments.pop();

  detach?.();
  press({ key: "Escape" });

  expect(times()).toBe(0);
});
