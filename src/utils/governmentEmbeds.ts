import { EmbedBuilder } from "discord.js";

interface GovernmentSection {
  name: string;
  lines: string[];
}

/** Keep every office visible while respecting Discord's field and message limits. */
export function governmentEmbeds(base: EmbedBuilder, sections: GovernmentSection[]): EmbedBuilder[] {
  const pages = [base];
  for (const section of sections) {
    const chunks: string[] = [];
    let chunk = "";
    for (const line of section.lines) {
      const bounded = line.slice(0, 1024);
      if (chunk && chunk.length + bounded.length + 1 > 1024) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += (chunk ? "\n" : "") + bounded;
    }
    if (chunk) chunks.push(chunk);
    for (const [index, value] of chunks.entries()) {
      const name = (index === 0 ? section.name : `${section.name} (continued)`).slice(0, 256);
      let page = pages[pages.length - 1];
      if (page.length + name.length + value.length > 6000 || (page.data.fields?.length ?? 0) >= 25) {
        page = new EmbedBuilder({ title: base.data.title, color: base.data.color, footer: base.data.footer });
        pages.push(page);
      }
      page.addFields({ name, value, inline: false });
    }
  }
  return pages;
}
