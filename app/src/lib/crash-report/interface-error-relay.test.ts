import { expect, test } from "vitest";

import type { InterfaceError } from "#lib/ipc/bindings.ts";

import { InterfaceErrorRelay } from "./interface-error-relay";

function error(message: string): InterfaceError {
  return { message, stack: null };
}

function messagesDeliveredBy(relay: InterfaceErrorRelay) {
  const delivered: string[] = [];
  const stop = relay.deliverTo(({ message }) => {
    delivered.push(message);
  });
  return { delivered, stop };
}

test("delivers an error heard before anything took delivery", () => {
  const relay = new InterfaceErrorRelay();
  relay.hear(error("load failed"));

  const { delivered } = messagesDeliveredBy(relay);

  expect(delivered).toEqual(["load failed"]);
});

test("keeps only the first error heard while nothing takes delivery", () => {
  const relay = new InterfaceErrorRelay();
  relay.hear(error("load failed"));
  relay.hear(error("render failed"));

  const { delivered } = messagesDeliveredBy(relay);

  expect(delivered).toEqual(["load failed"]);
});

test("passes on errors heard once something takes delivery", () => {
  const relay = new InterfaceErrorRelay();
  const { delivered } = messagesDeliveredBy(relay);

  relay.hear(error("render failed"));
  relay.hear(error("click failed"));

  expect(delivered).toEqual(["render failed", "click failed"]);
});

test("holds errors again once delivery stops", () => {
  const relay = new InterfaceErrorRelay();
  const first = messagesDeliveredBy(relay);
  first.stop();

  relay.hear(error("late"));
  const second = messagesDeliveredBy(relay);

  expect(first.delivered).toEqual([]);
  expect(second.delivered).toEqual(["late"]);
});

test("an earlier delivery stopping leaves a later one in place", () => {
  const relay = new InterfaceErrorRelay();
  const first = messagesDeliveredBy(relay);
  const second = messagesDeliveredBy(relay);

  first.stop();
  relay.hear(error("after a remount"));

  expect(second.delivered).toEqual(["after a remount"]);
});
