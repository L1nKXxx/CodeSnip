"use client";

import { useEffect, useState } from "react";
import { codeToHtml } from "@/lib/highlight";

export default function TestHighlight() {
  const [code, setCode] = useState("function test() { console.log('Hello world'); }");
  const [highlighted, setHighlighted] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const testHighlight = async () => {
      try {
        console.log('Testing code highlighting...');
        const result = await codeToHtml({
          code,
          lang: "js",
          theme: "dark"
        });
        console.log('Success! Highlighted code:', result);
        setHighlighted(result);
        setError("");
      } catch (err) {
        console.error('Error:', err);
        setError(String(err));
        setHighlighted("");
      }
    };

    testHighlight();
  }, [code]);

  return (
    <div className="p-4">
      <h1>Code Highlight Test</h1>
      <textarea
        className="w-full h-32 p-2 border border-gray-300"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <div className="text-red-500 mt-2">Error: {error}</div>}
      <div className="mt-4 p-2 bg-gray-100">
        <h2>Highlighted Result:</h2>
        <div dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    </div>
  );
}