import { type BookPage, commands, type PageCrop } from "#lib/ipc/bindings.ts";

export interface CroppedPages {
  readonly pages: readonly BookPage[];
  readonly crop: PageCrop;
}

type Crop = Exclude<PageCrop, "whole">;

const askedCrops = new WeakMap<
  readonly BookPage[],
  Map<Crop, Promise<CroppedPages>>
>();

export function pageCrop(cropsBorders: boolean, isStrip: boolean): PageCrop {
  if (!cropsBorders) {
    return "whole";
  }
  return isStrip ? "sideBorders" : "borders";
}

export function suitsMode(crop: PageCrop, isStrip: boolean): boolean {
  return crop === "whole" || crop === pageCrop(true, isStrip);
}

export function croppedPages(
  pages: readonly BookPage[],
  crop: Crop,
): Promise<CroppedPages> {
  const crops = askedCrops.get(pages) ?? new Map<Crop, Promise<CroppedPages>>();
  askedCrops.set(pages, crops);
  const asked = crops.get(crop) ?? askCore(pages, crop);
  crops.set(crop, asked);
  return asked;
}

async function askCore(
  pages: readonly BookPage[],
  crop: Crop,
): Promise<CroppedPages> {
  try {
    const paths = await commands.croppedPagePaths(
      pages.map((page) => page.path),
      crop,
    );
    if (paths.length !== pages.length) {
      throw new RangeError(
        `crop ${String(pages.length)} pages: the core named ${String(paths.length)} cropped paths`,
      );
    }
    return {
      pages: pages.map((page, index) => ({
        ...page,
        path: paths[index] ?? page.path,
      })),
      crop,
    };
  } catch (error) {
    reportError(error);
    return { pages, crop: "whole" };
  }
}
