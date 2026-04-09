async function testShiki() {
  try {
    const { createHighlighter } = await import("shiki");
    console.log("Testing shiki code highlighting...");

    const highlighter = await createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: ["javascript", "typescript", "jsx", "tsx", "json", "rust", "go", "python", "cpp", "java", "html", "sql", "bash"],
    });

    console.log("Highlighter created successfully");

    const code = 'function test() {\n  console.log("Hello world");\n}';
    const result = highlighter.codeToHtml(code, {
      lang: "javascript",
      theme: "github-dark",
    });

    console.log("Code highlighting successful");
    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

testShiki();