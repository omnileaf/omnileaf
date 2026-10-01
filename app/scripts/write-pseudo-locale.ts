import { writeFile } from "node:fs/promises";

import english from "../messages/en.json" with { type: "json" };
import { pseudoMessages } from "../src/lib/language/pseudo-locale.ts";

const PSEUDO = new URL("../messages/en-XA.json", import.meta.url);

await writeFile(
  PSEUDO,
  `${JSON.stringify(pseudoMessages(english), null, 2)}\n`,
);
