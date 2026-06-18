import React from "react";
import Markdown from "react-markdown";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  // Support custom inline element styling in keeping with VSCode editor typography
  return (
    <div className="markdown-body text-xs text-gray-300 leading-relaxed font-sans space-y-2 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-white [&_pre]:bg-[#111115] [&_pre]:border [&_pre]:border-[#3e3e3e] [&_pre]:p-3 [&_pre]:rounded [&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-amber-200/90 [&_code]:bg-[#111115] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_a]:text-[#007acc] [&_a]:hover:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-400 [&_hr]:border-[#3e3e3e] [&_hr]:my-4">
      <Markdown>{content || "*No description configure or details supplied.*"}</Markdown>
    </div>
  );
}
