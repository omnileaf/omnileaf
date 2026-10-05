import { describe, expect, test } from "vitest";

import type { LicenceCatalogue } from "./catalogue.ts";
import {
  groupByLicence,
  licenceGroupName,
  type LicensedPackage,
  licensedPackages,
} from "./licences.ts";

const COLLATOR = new Intl.Collator("en");

const EMPTY: LicenceCatalogue = { packages: [], texts: [] };

function licensed(name: string, licence: string): LicensedPackage {
  return {
    key: `rust/${name}@1.0.0`,
    name,
    version: "1.0.0",
    licence,
    texts: [],
  };
}

describe("licensedPackages", () => {
  test("gives each package its texts and a key naming its ecosystem", () => {
    const rust: LicenceCatalogue = {
      packages: [
        { name: "sample-alpha", version: "1.0.0", licence: "MIT", texts: [1] },
      ],
      texts: [
        { licence: "ISC", text: "ISC text" },
        { licence: "MIT", text: "MIT text" },
      ],
    };

    const packages = licensedPackages({ rust, javascript: EMPTY });

    expect(packages).toEqual([
      {
        key: "rust/sample-alpha@1.0.0",
        name: "sample-alpha",
        version: "1.0.0",
        licence: "MIT",
        texts: [{ licence: "MIT", text: "MIT text" }],
      },
    ]);
  });

  test("keeps a package from each ecosystem apart under the same name", () => {
    const catalogue: LicenceCatalogue = {
      packages: [
        { name: "sample", version: "1.0.0", licence: "MIT", texts: [0] },
      ],
      texts: [{ licence: "MIT", text: "MIT text" }],
    };

    const keys = licensedPackages({
      rust: catalogue,
      javascript: catalogue,
    }).map(({ key }) => key);

    expect(keys).toEqual(["rust/sample@1.0.0", "javascript/sample@1.0.0"]);
  });

  test("refuses a catalogue that names a text it does not hold", () => {
    const rust: LicenceCatalogue = {
      packages: [
        { name: "sample", version: "1.0.0", licence: "MIT", texts: [3] },
      ],
      texts: [],
    };

    expect(() => licensedPackages({ rust, javascript: EMPTY })).toThrow(
      /sample/,
    );
  });
});

describe("licenceGroupName", () => {
  test.each([
    ["MIT", "MIT"],
    ["MIT OR Apache-2.0", "Apache-2.0 OR MIT"],
    ["(MIT OR Apache-2.0)", "Apache-2.0 OR MIT"],
    ["Apache-2.0  OR  MIT", "Apache-2.0 OR MIT"],
    ["MIT/Apache-2.0", "Apache-2.0 OR MIT"],
    ["Zlib OR Apache-2.0 OR MIT", "Apache-2.0 OR MIT OR Zlib"],
    ["Unicode-3.0 AND MIT", "MIT AND Unicode-3.0"],
    [
      "Apache-2.0 WITH LLVM-exception OR MIT",
      "Apache-2.0 WITH LLVM-exception OR MIT",
    ],
    [
      "(MIT OR Apache-2.0) AND Unicode-3.0",
      "(MIT OR Apache-2.0) AND Unicode-3.0",
    ],
    ["MIT OR Apache-2.0 AND Zlib", "MIT OR Apache-2.0 AND Zlib"],
  ])("writes %j as %j", (expression, name) => {
    expect(licenceGroupName(expression)).toBe(name);
  });
});

describe("groupByLicence", () => {
  test("puts the most used licence first, then the rest by name", () => {
    const packages = [
      licensed("sample-a", "Zlib"),
      licensed("sample-b", "MIT"),
      licensed("sample-c", "MIT OR Apache-2.0"),
      licensed("sample-d", "MIT"),
      licensed("sample-e", "ISC"),
    ];

    const groups = groupByLicence(packages, COLLATOR);

    expect(groups.map(({ name }) => name)).toEqual([
      "MIT",
      "Apache-2.0 OR MIT",
      "ISC",
      "Zlib",
    ]);
  });

  test("groups the same licence however it is written", () => {
    const packages = [
      licensed("sample-a", "MIT OR Apache-2.0"),
      licensed("sample-b", "Apache-2.0 OR MIT"),
    ];

    const groups = groupByLicence(packages, COLLATOR);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  test("orders each group's packages by name", () => {
    const packages = [
      licensed("sample-c", "MIT"),
      licensed("Sample-b", "MIT"),
      licensed("sample-a", "MIT"),
    ];

    const groups = groupByLicence(packages, COLLATOR);

    expect(groups[0]?.packages.map(({ name }) => name)).toEqual([
      "sample-a",
      "Sample-b",
      "sample-c",
    ]);
  });
});
