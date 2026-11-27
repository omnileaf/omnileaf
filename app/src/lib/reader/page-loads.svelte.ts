import { PAGES_LOADING_AT_ONCE } from "./page-requests.ts";

export class PageLoads {
  #loading = $state(0);

  get room(): number {
    return PAGES_LOADING_AT_ONCE - this.#loading;
  }

  /** Counts the image as loading until it loads or fails, even once it leaves the page, as neither Chromium nor WebKit drops an image's request when its element is removed. */
  load(image: HTMLImageElement, url: string): void {
    if (image.getAttribute("src") === url) {
      return;
    }
    this.#loading += 1;
    const settle = (): void => {
      image.removeEventListener("load", settle);
      image.removeEventListener("error", settle);
      this.#loading -= 1;
    };
    image.addEventListener("load", settle);
    image.addEventListener("error", settle);
    image.src = url;
  }
}

export const pageLoads = new PageLoads();
