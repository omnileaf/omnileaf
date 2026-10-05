import { expect, test } from "vitest";

import {
  catalogueOf,
  packageRootOf,
  type ShippedPackage,
} from "./shipped-packages";

const STORE = "/work/app/node_modules/.pnpm";

function shipped(overrides: Partial<ShippedPackage>): ShippedPackage {
  return {
    name: "sample-alpha",
    version: "1.0.0",
    licence: "MIT",
    files: [{ name: "LICENSE", text: "MIT text" }],
    ...overrides,
  };
}

test("finds the package a module from the pnpm store belongs to", () => {
  const root = packageRootOf(
    `${STORE}/sample-alpha@1.0.0/node_modules/sample-alpha/src/index.js`,
  );

  expect(root).toBe(`${STORE}/sample-alpha@1.0.0/node_modules/sample-alpha`);
});

test("keeps a scoped package's scope in its folder", () => {
  const root = packageRootOf(
    `${STORE}/@sample+icons@2.0.0/node_modules/@sample/icons/dist/a.js?v=3`,
  );

  expect(root).toBe(`${STORE}/@sample+icons@2.0.0/node_modules/@sample/icons`);
});

test("leaves out the app's own and virtual modules", () => {
  const roots = [
    "/work/app/src/routes/+page.svelte",
    "\0virtual:sample",
    "/work/app/src/lib/sample.svelte?svelte&type=style&lang.css",
  ].map(packageRootOf);

  expect(roots).toEqual([undefined, undefined, undefined]);
});

test("lists each package with its licence and the texts it ships", () => {
  const catalogue = catalogueOf([shipped({})]);

  expect(catalogue).toEqual({
    packages: [
      { name: "sample-alpha", version: "1.0.0", licence: "MIT", texts: [0] },
    ],
    texts: [{ licence: "MIT", text: "MIT text" }],
  });
});

test("shares one text between the packages that ship it", () => {
  const catalogue = catalogueOf([
    shipped({ name: "sample-beta" }),
    shipped({ name: "sample-alpha" }),
  ]);

  expect(catalogue.texts).toHaveLength(1);
  expect(
    catalogue.packages.map(({ name, texts }) => ({ name, texts })),
  ).toEqual([
    { name: "sample-alpha", texts: [0] },
    { name: "sample-beta", texts: [0] },
  ]);
});

test("names each of several texts by its file", () => {
  const catalogue = catalogueOf([
    shipped({
      licence: "Apache-2.0 OR MIT",
      files: [
        { name: "LICENSE_MIT", text: "MIT text" },
        { name: "LICENSE_APACHE-2.0", text: "Apache text" },
      ],
    }),
  ]);

  expect(catalogue.texts).toEqual([
    { licence: "LICENSE_APACHE-2.0", text: "Apache text" },
    { licence: "LICENSE_MIT", text: "MIT text" },
  ]);
});

test("sorts packages by name, then version", () => {
  const catalogue = catalogueOf([
    shipped({ version: "2.0.0" }),
    shipped({ version: "1.0.0" }),
    shipped({ name: "sample-aardvark", version: "9.0.0" }),
  ]);

  expect(
    catalogue.packages.map(({ name, version }) => `${name}@${version}`),
  ).toEqual([
    "sample-aardvark@9.0.0",
    "sample-alpha@1.0.0",
    "sample-alpha@2.0.0",
  ]);
});

test("writes line endings as newlines", () => {
  const catalogue = catalogueOf([
    shipped({ files: [{ name: "LICENSE", text: "first\r\nsecond\r\n" }] }),
  ]);

  expect(catalogue.texts[0]?.text).toBe("first\nsecond\n");
});
