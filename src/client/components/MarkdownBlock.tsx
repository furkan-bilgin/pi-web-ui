import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math-extended";
import remarkGfm from "remark-gfm";
import { stripDollarInBlocks } from "../lib/math-preprocessor";

function CodeBlock({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"code">) {
  const match = /language-(\w+)/.exec(className || "");
  const isInline = !match && !className;
  const code = String(children).replace(/\n$/, "");

  if (isInline) {
    return (
      <code
        className="rounded border bg-muted/50 px-1 py-0.5 text-sm font-mono text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border bg-muted/30">
      {match && (
        <div className="flex items-center justify-between border-b px-3 py-1 text-xs text-muted-foreground">
          <span>{match[1]}</span>
          <button
            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            onClick={() => navigator.clipboard.writeText(code)}
          >
            copy
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownBlock({ text }: { text: string }) {
  const processed = stripDollarInBlocks(text ?? "");
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: CodeBlock,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:text-foreground"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || ""}
              className="max-h-96 rounded-lg border object-contain"
              loading="lazy"
            />
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
