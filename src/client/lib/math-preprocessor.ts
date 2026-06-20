/**
 * Lightweight pre-processor for AI-generated LaTeX.
 *
 * Some AI models output:
 * 1. Nested `$...$` inside `\(...\)` or `\[...\]` blocks — KaTeX errors
 *    on `$` inside math mode, so we strip them.
 * 2. Raw LaTeX expressions without any delimiters (e.g. with `\tag{...}`)
 *    — we detect these and wrap in `$$...$$` so remark-math-extended picks
 *    them up.
 */

export function stripDollarInBlocks(text: string): string {
  if (!text) return text || "";

  // Step 1: Strip $ from within \(...\) blocks
  let result = text.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_, inner: string) => `\\(${inner.replace(/\$/g, "")}\\)`,
  );

  // Step 2: Strip $ from within \[...\] blocks
  result = result.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_, inner: string) => `\\[${inner.replace(/\$/g, "")}\\]`,
  );

  // Step 3: Some AI models output LaTeX lines without any delimiters,
  // typically ending with `\tag{...}`.  Detect these and wrap in `$$...$$`.
  // Process each line independently so adjacent equations stay separate.
  const lines = result.split("\n");
  const out = lines.map((line) => {
    const trimmed = line.trim();
    // Skip empty lines or lines already inside a math block
    if (!trimmed) return line;
    if (trimmed.startsWith("$$") || trimmed.startsWith("$")) return line;
    // Lines with `\(` or `\[` are already handled by remark-math-extended
    if (trimmed.includes("\\(") || trimmed.includes("\\[")) return line;

    // Heuristic: a line that contains `\tag{` AND has LaTeX commands
    // before than `\tag` is display math.  Regular prose with an embedded
    // \tag reference is possible but rare — and would not have multiple
    // other LaTeX commands preceding it.
    if (/\\tag\s*\{/.test(trimmed)) {
      const beforeTag = trimmed.slice(0, trimmed.indexOf("\\tag"));
      const hasLatexCmds = /\\[a-zA-Z]+/.test(beforeTag);
      // Also check that the line doesn't read like prose
      const words = beforeTag.split(/[\s,;:.!?]+/).filter(Boolean);
      const proseWordCount = words.filter((w) => /^[a-z]{2,}$/.test(w)).length;
      if (hasLatexCmds && proseWordCount === 0) {
        return `$$${trimmed}$$`;
      }
    }

    return line;
  });
  result = out.join("\n");

  return result;
}
