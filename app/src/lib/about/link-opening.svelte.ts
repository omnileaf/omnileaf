import type { commands, ProjectLink } from "#lib/ipc/bindings.ts";

export type OpenProjectLink = typeof commands.openProjectLink;

export class LinkOpening {
  hasFailed = $state(false);

  constructor(private readonly openLink: OpenProjectLink) {}

  async open(link: ProjectLink): Promise<void> {
    this.hasFailed = false;
    const result = await this.openLink(link);
    this.hasFailed = result.status === "error";
  }
}
