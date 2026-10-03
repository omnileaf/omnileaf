import type { commands, ProjectLink } from "$lib/ipc/bindings";

export type OpenProjectLink = typeof commands.openProjectLink;

/** Opens the project's pages in the browser and remembers whether the last attempt failed. */
export class LinkOpening {
  hasFailed = $state(false);

  constructor(private readonly openLink: OpenProjectLink) {}

  async open(link: ProjectLink): Promise<void> {
    const result = await this.openLink(link);
    this.hasFailed = result.status === "error";
  }
}
