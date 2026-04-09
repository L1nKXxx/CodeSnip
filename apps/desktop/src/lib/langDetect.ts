const looksLikeJson = (t: string) => {
  const s = t.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

export function guessLanguage(text: string): string {
  const t = text.trim();
  if (!t) return "text";

  if (looksLikeJson(t)) return "json";
  if (/^#!/.test(t)) return "bash";

  if (/(?:^|\s)import\s+React\b|\bfrom\s+['"]react['"]/.test(t)) return "tsx";
  if (/(?:^|\s)interface\s+\w+|\btype\s+\w+\s*=/.test(t) && /;/.test(t)) return "ts";
  if (/console\.log\(|function\s+\w+\(|=>/.test(t)) return "js";

  if (/\bdef\s+\w+\(|^\s*import\s+\w+/m.test(t)) return "python";
  if (/\bpackage\s+main\b|\bfmt\./.test(t)) return "go";
  if (/\bpublic\s+class\s+\w+|\bSystem\.out\.println/.test(t)) return "java";
  if (/#include\s+<\w+>|\bstd::/.test(t)) return "cpp";
  if (/\bfn\s+\w+|\blet\s+mut\b|\buse\s+\w+::/.test(t)) return "rust";

  if (/<[A-Za-z][\s\S]*?>/.test(t) && /<\/[A-Za-z]+>/.test(t)) return "html";
  if (/^\s*SELECT\b|\bFROM\b|\bWHERE\b/im.test(t)) return "sql";

  return "text";
}

