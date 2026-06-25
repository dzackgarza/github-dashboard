import { describe, expect, it } from "vitest";
import { toMarkdownExcerpt } from "./markdownExcerpt";

describe("toMarkdownExcerpt", () => {
  it("converts headings to plain text", () => {
    const result = toMarkdownExcerpt("# Release Notes\nTrack progress", 120);
    expect(result).toContain("Release Notes");
  });

  it("preserves emphasis and links as readable text", () => {
    const result = toMarkdownExcerpt("Use **bold** and _italic_ with [GitHub](https://github.com)", 120);
    expect(result).toContain("Use bold and italic with GitHub");
  });

  it("keeps inline code text", () => {
    const result = toMarkdownExcerpt("Run `npm test` before `deploy`", 120);
    expect(result).toContain("npm test");
    expect(result).toContain("deploy");
  });

  it("preserves underscores in markdown source text", () => {
    const result = toMarkdownExcerpt("snake_case_name should stay readable", 120);
    expect(result).toContain("snake_case_name");
  });

  it("truncates long excerpts with an ellipsis", () => {
    const result = toMarkdownExcerpt("one two three four five six seven eight nine ten eleven twelve thirteen", 20);
    expect(result).toContain("…");
    expect(result.length).toBeLessThanOrEqual(21);
  });
});
