import { createHighlighter } from "shiki";

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;
let highlighter: Highlighter | null = null;

export async function codeToHtml(opts: {
  code: string;
  lang: string;
  theme: "dark" | "light";
}) {
  try {
    if (!highlighter) {
      highlighter = await createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: ["javascript", "typescript", "jsx", "tsx", "json", "rust", "go", "python", "cpp", "java", "html", "sql", "bash"],
      });
    }

    const result = highlighter.codeToHtml(opts.code, {
      lang: opts.lang || "text",
      theme: opts.theme === "dark" ? "github-dark" : "github-light",
    });
    return result;
  } catch (error) {
    console.error("Code highlighting error:", error);
    return `<pre><code>${opts.code}</code></pre>`;
  }
}

