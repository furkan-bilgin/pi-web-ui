/**
 * Lightweight pre-processor for AI-generated LaTeX.
 *
 * Some AI models output nested `$...$` inside `\(...\)` or `\[...\]` blocks.
 * KaTeX errors on `$` inside math mode, so we strip them from within those
 * blocks before passing to remark-math-extended (which handles all four
 * delimiter styles natively).
 */

export function stripDollarInBlocks(text: string): string {
  if (!text) return text || "";

  // Strip $ from within \(...\) blocks
  let result = text.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_, inner: string) => `\\(${inner.replace(/\$/g, "")}\\)`,
  );

  // Strip $ from within \[...\] blocks
  result = result.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_, inner: string) => `\\[${inner.replace(/\$/g, "")}\\]`,
  );

  return result;
}
