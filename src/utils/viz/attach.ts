/**
 * Turning a rendered chart into a Discord attachment.
 *
 * Attachment filenames must differ between edits of the same message. Discord
 * caches by name, so re-using `chart.png` when paging /marketshare serves the
 * previous page's image from cache — the embed updates, the picture does not.
 */

import { AttachmentBuilder } from "discord.js";

export interface ChartAttachment {
  file: AttachmentBuilder;
  /** Pass to `embed.setImage()`. */
  url: string;
}

let counter = 0;

/**
 * @param base  Stable slug for the command, e.g. `"marketshare"`.
 * @param state Anything that distinguishes this render from the last one on the
 *              same message (page number, tab, toggle state).
 */
export function chartAttachment(buffer: Buffer, base: string, state: string | number = ""): ChartAttachment {
  const suffix = `${String(state).replace(/[^a-z0-9]+/gi, "-")}${state === "" ? "" : "-"}${(counter = (counter + 1) % 100000)}`;
  const name = `${base}-${suffix}.png`.replace(/-+/g, "-");
  return {
    file: new AttachmentBuilder(buffer, { name, description: `${base} chart` }),
    url: `attachment://${name}`,
  };
}
