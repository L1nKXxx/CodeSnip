"use client";

import { useEffect, useState } from "react";
import { createHighlighter } from "shiki";

export default function TestShiki() {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const testShiki = async () => {
      try {
        console.log('Testing shiki in React...');
        const highlighter = await createHighlighter({
          themes: ['github-dark', 'github-light'],
          langs: ['javascript'],
        });
        console.log('Highlighter created successfully');
        
        const code = 'function test() {\n  console.log("Hello world");\n}';
        const highlighted = highlighter.codeToHtml(code, {
          lang: 'javascript',
          theme: 'github-dark',
        });
        console.log('Highlighting successful');
        setResult(highlighted);
      } catch (err) {
        console.error('Error:', err);
        setError(String(err));
      }
    };

    testShiki();
  }, []);

  return (
    <div className="p-4">
      <h1>Shiki Test</h1>
      {error && <div className="text-red-500">Error: {error}</div>}
      <div className="mt-4 p-4 bg-gray-900 rounded-lg">
        <h2>Highlighted Code:</h2>
        <div dangerouslySetInnerHTML={{ __html: result }} />
      </div>
    </div>
  );
}