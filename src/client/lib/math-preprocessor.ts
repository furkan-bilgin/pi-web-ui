/**
 * Preprocesses markdown text to convert common LaTeX delimiter patterns
 * that some AI models use instead of standard $...$ / $$...$$.
 *
 * Converts:
 *   \( ... \)  →  $ ... $       (inline math, with backslashes)
 *   \[ ... \]  →  $$ ... $$     (display math, with backslashes)
 *   ( ... ) when content has a \command → $ ... $   (no backslashes)
 *   [ ... ] when content has a LaTeX env  → $$ ... $$ (no backslashes)
 */

function findMatchingParen(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function findMatchingBracket(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

export function preprocessMath(text: string): string {
  if (!text) return text || "";
  let result = text;

  // 1. Convert \[ ... \] (display math with backslashes)
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`);

  // 2. Convert \( ... \) (inline math with backslashes)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`);

  // 3. Convert raw [...] display math — match the full content between
  //    brackets, then check if it contains any LaTeX command.
  result = result.replace(
    /\[([\s\S]*?)\]/g,
    (match, inner) => {
      if (/\\[a-zA-Z]/.test(inner) && inner.includes("\\begin")) {
        return `$$${inner}$$`;
      }
      return match;
    }
  );

  // 4. Convert raw (...) inline math using a balanced-paren scanner.
  //    Only convert when the content has at least one \command.
  const chars = result.split("");
  const out: string[] = [];
  let i = 0;

  while (i < chars.length) {
    if (chars[i] === "(") {
      const end = findMatchingParen(result, i + 1);
      if (end > i) {
        const inner = result.slice(i + 1, end);
        // Check if inner has a LaTeX command AND is not just punctuation
        if (/\\[a-zA-Z]/.test(inner) && !/^[\s,;:.!?]*$/.test(inner)) {
          out.push("$" + inner + "$");
          i = end + 1;
          continue;
        }
      }
    }
    out.push(chars[i]);
    i++;
  }

  return out.join("");
}
