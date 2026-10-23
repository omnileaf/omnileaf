import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import map from "../src/lib/icons/icon-map.json" with { type: "json" };
import { PORTED_CODE } from "../src/lib/licences/shipped-packages.ts";
import { iconArtwork, renderIconFiles } from "./icon-css.ts";

const ICONS = new URL("../src/lib/icons/", import.meta.url);

const LUCIDE_STROKE = 'stroke-width="2"';
const LUCIDE_LIGHT_STROKE = 'stroke-width="1.5"';

interface ArtworkSource {
  readonly folder: string;
  readonly drawLight: boolean;
}

const SOURCES: Readonly<Record<string, ArtworkSource>> = {
  framework7: { folder: "svg", drawLight: false },
  "material-symbols": { folder: "rounded", drawLight: false },
  lucide: { folder: "icons", drawLight: false },
  "lucide/light": { folder: "icons", drawLight: true },
};

function packageSpec(set: string): string {
  const folder = `src/lib/icons/${set.split("/")[0] ?? set}`;
  const ported = PORTED_CODE.find((entry) => entry.folder === folder);
  if (ported === undefined) {
    throw new Error(`No ported code entry credits ${folder}.`);
  }
  return `${ported.name}@${ported.version}`;
}

function unpack(spec: string, into: string): string {
  const tarball = execFileSync(
    "npm",
    ["pack", spec, "--pack-destination", into, "--silent"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .at(-1);
  if (tarball === undefined) {
    throw new Error(`npm pack ${spec} named no tarball.`);
  }
  const folder = join(into, tarball.replace(/\.tgz$/u, ""));
  mkdirSync(folder, { recursive: true });
  execFileSync("tar", ["-xzf", join(into, tarball), "-C", folder]);
  return join(folder, "package");
}

function lighten(svg: string, name: string): string {
  if (!svg.includes(LUCIDE_STROKE)) {
    throw new Error(`Lucide's ${name} has no ${LUCIDE_STROKE} to lighten.`);
  }
  return svg.replaceAll(LUCIDE_STROKE, LUCIDE_LIGHT_STROKE);
}

const scratch = await mkdtemp(join(tmpdir(), "omnileaf-icons-"));
try {
  const unpacked = new Map<string, string>();
  for (const [set, source] of Object.entries(SOURCES)) {
    const spec = packageSpec(set);
    const root = unpacked.get(spec) ?? unpack(spec, scratch);
    unpacked.set(spec, root);
    const target = new URL(`${set}/`, ICONS);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await copyFile(join(root, "LICENSE"), new URL("LICENSE", target));
    for (const { name } of iconArtwork(map).filter((art) => art.set === set)) {
      const svg = await readFile(
        join(root, source.folder, `${name}.svg`),
        "utf8",
      );
      await writeFile(
        new URL(`${name}.svg`, target),
        source.drawLight ? lighten(svg, name) : svg,
      );
    }
  }
  for (const [file, text] of renderIconFiles(map)) {
    await writeFile(new URL(file, ICONS), text);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
