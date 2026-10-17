import type { CreatorRole } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export function roleName(role: CreatorRole | null): string {
  switch (role) {
    case "story":
      return m.series_role_story();
    case "art":
      return m.series_role_art();
    case "storyAndArt":
      return m.series_role_story_and_art();
    case null:
      return m.series_detail_by();
  }
}
