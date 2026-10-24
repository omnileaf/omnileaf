import { defineParams } from "@sveltejs/kit/params";

const KIT_PAGE_SEGMENT = "kit";

export const params = defineParams({
  kitPage: (segment: string) =>
    import.meta.env.DEV &&
    import.meta.env.VITE_KIT_PAGE === "on" &&
    segment === KIT_PAGE_SEGMENT
      ? segment
      : undefined,
});
