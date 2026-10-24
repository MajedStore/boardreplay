"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";

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
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default Content;
