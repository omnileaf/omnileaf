import { expect, test } from "vitest";

import { sendingNewest } from "./newest-call";

class SlowCalls {
  readonly sent: string[] = [];
  inFlight = 0;
  mostInFlight = 0;
  readonly #answers: (() => void)[] = [];

  readonly send = (value: string): Promise<void> => {
    this.sent.push(value);
    this.inFlight += 1;
    this.mostInFlight = Math.max(this.mostInFlight, this.inFlight);
    return new Promise((answered) => {
      this.#answers.push(() => {
        this.inFlight -= 1;
        answered();
      });
    });
  };

  async answerAll(): Promise<void> {
    for (
      let answer = this.#answers.shift();
      answer !== undefined;
      answer = this.#answers.shift()
    ) {
      answer();
      await Promise.resolve();
      await Promise.resolve();
    }
  }
}

test("sends a call straight away when none is in flight", () => {
  const calls = new SlowCalls();
  const send = sendingNewest(calls.send);

  send("series");

  expect(calls.sent).toEqual(["series"]);
});

test("waits for the call in flight, then sends only the newest one", async () => {
  const calls = new SlowCalls();
  const send = sendingNewest(calls.send);

  send("series");
  send("library");
  send("reader");
  await calls.answerAll();

  expect(calls.sent).toEqual(["series", "reader"]);
  expect(calls.mostInFlight).toBe(1);
});

test("sends again once the last call has landed", async () => {
  const calls = new SlowCalls();
  const send = sendingNewest(calls.send);
  send("series");
  await calls.answerAll();

  send("reader");

  expect(calls.sent).toEqual(["series", "reader"]);
});
