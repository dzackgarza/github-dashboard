import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";

const DEFAULT_EXCERPT_LENGTH = 120;

function toText(markdown: string): string {
  const root = unified().use(remarkParse).parse(markdown);
  return toString(root).replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const raw = text.slice(0, maxLength).trimEnd();
  return `${raw}…`;
}

export function toMarkdownExcerpt(markdown: string | null | undefined, maxLength = DEFAULT_EXCERPT_LENGTH): string {
  if (!markdown) {
    return "";
  }
  return truncate(toText(markdown), maxLength);
}
