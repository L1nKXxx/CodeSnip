import { createHighlighter } from "shiki";

let highlighter: any = null;

export async function codeToHtml(opts: {
  code: string;
  lang: string;
  theme: "dark" | "light";
}) {
  try {
    console.log('Code highlighting started with:', { lang: opts.lang, theme: opts.theme });
    
    if (!highlighter) {
      console.log('Creating highlighter...');
      highlighter = await createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: ["javascript", "typescript", "jsx", "tsx", "json", "rust", "go", "python", "cpp", "java", "html", "sql", "bash"],
      });
      console.log('Highlighter created successfully');
    }
    
    const result = highlighter.codeToHtml(opts.code, {
      lang: opts.lang || "text",
      theme: opts.theme === "dark" ? "github-dark" : "github-light",
    });
    console.log('Code highlighting successful');
    return result;
  } catch (error) {
    console.error('Code highlighting error:', error);
    return `<pre><code>${opts.code}</code></pre>`;
  }
}

