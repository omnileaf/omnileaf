import type { Locator, Page } from "@playwright/test";

const CONTROLS =
  "button, a[href], [role=button], [role=checkbox], [role=switch], [role=tab], [role=radio]";
const MOST_CONTROLS_PER_SCREEN = 20;
const ACTION_TIMEOUT_MS = 2_000;
const INK_DISTANCE = 48;
const LEAST_INK_KEPT = 0.25;
const NAME_LENGTH = 40;
const OPENED = "[role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

type State = "hovered" | "focused" | "pressed";

function markOneControlPerLook(page: Page): Promise<number> {
  return page.evaluate(
    ({ selector, most }) => {
      for (const marked of document.querySelectorAll<HTMLElement>(
        "[data-ink-check]",
      )) {
        delete marked.dataset.inkCheck;
      }
      const looks = new Set<string>();
      for (const control of document.querySelectorAll<HTMLElement>(selector)) {
        const look = `${control.tagName} ${control.getAttribute("class") ?? ""}`;
        const { width, height } = control.getBoundingClientRect();
        const isReachable =
          width > 0 &&
          height > 0 &&
          getComputedStyle(control).pointerEvents !== "none" &&
          control.closest("[aria-hidden=true], [inert], [disabled]") === null;
        if (isReachable && !looks.has(look) && looks.size < most) {
          control.dataset.inkCheck = String(looks.size);
          looks.add(look);
        }
      }
      return looks.size;
    },
    { selector: CONTROLS, most: MOST_CONTROLS_PER_SCREEN },
  );
}

function inkOf(page: Page, picture: Buffer): Promise<number> {
  return page.evaluate(
    async ({ png, distance }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (context === null) {
        return 0;
      }
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      const counts = new Map<number, number>();
      for (let index = 0; index < data.length; index += 4) {
        const colour =
          ((data[index] ?? 0) << 16) |
          ((data[index + 1] ?? 0) << 8) |
          (data[index + 2] ?? 0);
        counts.set(colour, (counts.get(colour) ?? 0) + 1);
      }
      const [ground] = [...counts].reduce(
        (most, entry) => (entry[1] > most[1] ? entry : most),
        [0, 0],
      );
      const groundRed = (ground >> 16) & 255;
      const groundGreen = (ground >> 8) & 255;
      const groundBlue = ground & 255;
      let ink = 0;
      for (let index = 0; index < data.length; index += 4) {
        const away =
          Math.abs((data[index] ?? 0) - groundRed) +
          Math.abs((data[index + 1] ?? 0) - groundGreen) +
          Math.abs((data[index + 2] ?? 0) - groundBlue);
        if (away > distance) {
          ink += 1;
        }
      }
      return ink;
    },
    { png: picture.toString("base64"), distance: INK_DISTANCE },
  );
}

async function pictureOf(page: Page, control: Locator): Promise<Buffer> {
  const words = await control.evaluate((element) => {
    const boxes: DOMRect[] = [];
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node !== null; node = texts.nextNode()) {
      if (/\S/.test(node.textContent ?? "")) {
        const range = document.createRange();
        range.selectNodeContents(node);
        boxes.push(...range.getClientRects());
      }
    }
    for (const art of element.querySelectorAll("svg, img")) {
      boxes.push(art.getBoundingClientRect());
    }
    const drawn = boxes.filter((box) => box.width > 1 && box.height > 1);
    if (drawn.length === 0) {
      return null;
    }
    const left = Math.min(...drawn.map((box) => box.left));
    const top = Math.min(...drawn.map((box) => box.top));
    return {
      x: left,
      y: top,
      width: Math.max(...drawn.map((box) => box.right)) - left,
      height: Math.max(...drawn.map((box) => box.bottom)) - top,
    };
  });
  if (words === null) {
    throw new Error("the control draws no words or icon");
  }
  return page.screenshot({
    clip: words,
    animations: "disabled",
    caret: "hide",
    timeout: ACTION_TIMEOUT_MS,
  });
}

async function inkWhile(
  page: Page,
  control: Locator,
  state: State,
): Promise<number | undefined> {
  try {
    if (state === "hovered") {
      await control.hover({ timeout: ACTION_TIMEOUT_MS });
    } else if (state === "focused") {
      await control.focus({ timeout: ACTION_TIMEOUT_MS });
    } else {
      const box = await control.boundingBox();
      if (box === null) {
        return undefined;
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
    }
    return await inkOf(page, await pictureOf(page, control));
  } catch {
    return undefined;
  } finally {
    if (state === "pressed") {
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
    await page.mouse.move(0, 0);
    await control.blur().catch(() => undefined);
    if ((await page.locator(OPENED).count()) > 0) {
      await page.keyboard.press("Escape");
    }
  }
}

/** Names each control whose icon and words mostly vanish while it is hovered, focused or pressed, judged by how much of the picture around them still stands out from its background. */
export async function controlsLostOnInteraction(page: Page): Promise<string[]> {
  const count = await markOneControlPerLook(page);
  await page.keyboard.press("Shift");
  const problems: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const control = page.locator(`[data-ink-check="${String(index)}"]`);
    const isReady = await control
      .scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (isReady) {
      await page.mouse.move(0, 0);
      const resting = await pictureOf(page, control)
        .then((picture) => inkOf(page, picture))
        .catch(() => 0);
      if (resting > 0) {
        const isPressable = await control.evaluate(
          (element) =>
            element.tagName === "BUTTON" &&
            !element.hasAttribute("aria-haspopup"),
        );
        const states: readonly State[] = isPressable
          ? ["hovered", "focused", "pressed"]
          : ["hovered", "focused"];
        for (const state of states) {
          const ink = await inkWhile(page, control, state);
          if (ink !== undefined && ink < resting * LEAST_INK_KEPT) {
            const name = await control.evaluate(
              (element, nameLength) =>
                `${element.tagName.toLowerCase()} “${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, nameLength)}”`,
              NAME_LENGTH,
            );
            problems.push(
              `${name} keeps ${String(Math.round((ink / resting) * 100))}% of its ink when ${state}`,
            );
          }
        }
      }
    }
  }
  return problems;
}
