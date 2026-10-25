"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { normalizeMathDelimiters } from "@/lib/markdown";

// Rendering tokens as React text keeps arbitrary photographed source code inert.
export function CodeBlock({
  code,
  language = "text",
}: {
  code: string;
  language?: string | null;
}) {
  const tokens = code.split(
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:class|struct|public|private|protected|const|let|var|function|def|return|if|else|for|while|void|int|float|double|char|bool|auto|new|delete|nullptr|null|None|true|false|import|from|include|using|namespace|SELECT|FROM|WHERE)\b|\b\d+(?:\.\d+)?\b)/g,
  );
  return (
    <pre className="syntax-code" data-language={language || "text"}>
      <code>
        {tokens.map((token, index) => {
          const kind = /^(\/\/|\/\*|#)/.test(token)
            ? "comment"
            : /^["']/.test(token)
              ? "string"
              : /^\d/.test(token)
                ? "number"
                : /^(class|struct|public|private|protected|const|let|var|function|def|return|if|else|for|while|void|int|float|double|char|bool|auto|new|delete|nullptr|null|None|true|false|import|from|include|using|namespace|SELECT|FROM|WHERE)$/.test(
                      token,
                    )
                  ? "keyword"
                  : "plain";
          return (
            <span key={index} className={`token-${kind}`}>
              {token}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export function Content({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={`content-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ children, className }) {
            const language = /language-([\w+-]+)/.exec(className || "")?.[1];
            return language || String(children).includes("\n") ? (
              <CodeBlock
                code={String(children).replace(/\n$/, "")}
                language={language}
              />
            ) : (
              <code className={className}>{children}</code>
            );
          },
        }}
      >
        {normalizeMathDelimiters(text)}
      </ReactMarkdown>
    </div>
  );
}

export default Content;
