"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { codeToHtml } from "@/lib/highlight";
import { guessLanguage } from "@/lib/langDetect";
import { isTauri } from "@/lib/tauri";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const MIN_SCALE = 0.55;
const MAX_SCALE = 12;
const scrollbarClass =
  "[scrollbar-width:thin] [scrollbar-color:rgba(161,161,170,0.65)_rgba(39,39,42,0.45)] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-900/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-500/65 [&::-webkit-scrollbar-thumb:hover]:bg-zinc-400/75 [&::-webkit-scrollbar-corner]:bg-zinc-900/40";

function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaretOffset(root: HTMLElement, targetOffset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let offset = Math.max(0, targetOffset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textLength = node.textContent?.length ?? 0;
    if (offset <= textLength) {
      range.setStart(node, offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    offset -= textLength;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export default function StickyCard() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLPreElement | null>(null);
  const lastCtrlAtRef = useRef<number>(0);
  const pendingCaretRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{ top: number; left: number } | null>(null);
  const [manualInput, setManualInput] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [highlightError, setHighlightError] = useState<string>("");
  const [scale, setScale] = useState<number>(1);
  const [opacity, setOpacity] = useState<number>(1);
  const [contentSize, setContentSize] = useState<{ width: number; height: number }>({
    width: 860,
    height: 560,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl+Ctrl");
  const [autostart, setAutostart] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const effectiveLang = useMemo(() => guessLanguage(manualInput), [manualInput]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!manualInput.trim()) {
        setHtml("");
        setHighlightError("");
        return;
      }
      try {
        const out = await codeToHtml({
          code: manualInput,
          lang: effectiveLang,
          theme: "dark",
        });
        if (cancelled) return;
        setHtml(out);
        setHighlightError("");
      } catch (error: unknown) {
        if (cancelled) return;
        setHtml("");
        setHighlightError(String(error));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [manualInput, effectiveLang]);

  useLayoutEffect(() => {
    // Keep a stable viewport so long content overflows and remains scrollable.
    setContentSize((prev) => {
      if (prev.width === 860 && prev.height === 560) return prev;
      return { width: 860, height: 560 };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isTauri()) return;
      try {
        const settings = await invoke<{ hotkey: string; autostart: boolean }>("get_settings");
        if (cancelled) return;
        setHotkey(settings.hotkey || "Ctrl+Ctrl");
        setAutostart(Boolean(settings.autostart));
      } catch {
        // ignore
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlistenOpen: UnlistenFn | null = null;
    let unlistenPaste: UnlistenFn | null = null;
    const readClipboard = async () => {
      try {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
        const text = await readText();
        if (text?.trim()) {
          setManualInput(text);
        }
      } catch {
        // ignore
      }
      window.setTimeout(() => editorRef.current?.focus(), 0);
    };
    const mount = async () => {
      if (!isTauri()) return;
      unlistenOpen = await listen("open-settings", () => {
        setSettingsOpen(true);
      });
      unlistenPaste = await listen("paste-from-clipboard", () => {
        void readClipboard();
      });
    };
    void mount();
    return () => {
      if (unlistenOpen) void unlistenOpen();
      if (unlistenPaste) void unlistenPaste();
    };
  }, []);

  useEffect(() => {
    const readClipboardText = async (): Promise<string> => {
      if (isTauri()) {
        try {
          const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
          return (await readText()) ?? "";
        } catch {
          // fallback to browser clipboard
        }
      }
      try {
        return await navigator.clipboard.readText();
      } catch {
        return "";
      }
    };

    const revealWindowAndPaste = async () => {
      if (isTauri()) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          await win.unminimize();
          await win.show();
          await win.setFocus();
        } catch {
          // ignore
        }
      }
      const text = await readClipboardText();
      if (text.trim()) {
        setManualInput(text);
      }
      window.setTimeout(() => editorRef.current?.focus(), 0);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Control") return;
      const now = Date.now();
      if (now - lastCtrlAtRef.current <= 320) {
        void revealWindowAndPaste();
      }
      lastCtrlAtRef.current = now;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeWindow = async () => {
    if (!isTauri()) return;
    try {
      await invoke("exit_app");
    } catch {
      // ignore
    }
  };

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!html) {
      editor.innerHTML = "";
      return;
    }
    editor.innerHTML = html;
    const pending = pendingCaretRef.current;
    if (pending !== null) {
      setCaretOffset(editor, pending);
      pendingCaretRef.current = null;
    }
    const scroll = pendingScrollRef.current;
    if (scroll) {
      editor.scrollTop = scroll.top;
      editor.scrollLeft = scroll.left;
      pendingScrollRef.current = null;
    }
  }, [html]);

  return (
    <div
      className="relative select-none"
      onMouseDownCapture={(e) => {
        if (!e.ctrlKey || e.button !== 0 || !isTauri()) return;
        e.preventDefault();
        void (async () => {
          try {
            await getCurrentWindow().startDragging();
          } catch {
            // ignore
          }
        })();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        void closeWindow();
      }}
    >
      <pre
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 m-0 whitespace-pre font-mono text-base leading-7 opacity-0"
      >
        {manualInput || " "}
      </pre>
      <div
        className="origin-top-left overflow-visible bg-transparent transition-[opacity,width,height] duration-75"
        style={{
          opacity,
          width: `${contentSize.width}px`,
          height: `${contentSize.height}px`,
        }}
      >
        <div
          className="relative"
          style={{
            width: `${contentSize.width}px`,
            height: `${contentSize.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="粘贴代码到这里实时预览"
            className={[
              `h-full overflow-x-scroll overflow-y-scroll bg-zinc-900/95 p-8 font-mono text-base leading-7 text-zinc-100 outline-none ${scrollbarClass}`,
              "pt-10",
              "empty:before:pointer-events-none empty:before:text-zinc-500 empty:before:content-[attr(data-placeholder)]",
              "[&_.shiki]:!bg-transparent",
              "[&_.shiki]:p-0",
              "[&_.shiki]:m-0",
              "[&_.shiki_pre]:m-0",
              "[&_.shiki_pre]:bg-transparent",
              "[&_.shiki_pre]:overflow-visible",
              "[&_.shiki_code]:font-mono",
            ].join(" ")}
            onInput={(e) => {
              const current = e.currentTarget;
              pendingScrollRef.current = { top: current.scrollTop, left: current.scrollLeft };
              pendingCaretRef.current = getCaretOffset(current);
              const nextText = current.innerText.replace(/\r/g, "");
              setManualInput(nextText);
            }}
            onWheel={(e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY;
                setScale((s) => clamp(s + (delta > 0 ? -0.06 : 0.06), MIN_SCALE, MAX_SCALE));
                return;
              }
              if (e.shiftKey) {
                e.preventDefault();
                const delta = e.deltaY;
                setOpacity((o) => clamp(o + (delta > 0 ? -0.08 : 0.08), 0, 1));
              }
            }}
            spellCheck={false}
            data-tauri-drag-region={false}
          />
          {highlightError && (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-red-900/30 px-2 py-1 text-xs text-red-300">
              代码高亮错误: {highlightError}
            </div>
          )}
        </div>
      </div>
      {settingsOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="w-[420px] rounded-xl bg-zinc-900 p-5 text-zinc-100 shadow-2xl">
            <div className="text-base font-medium">设置</div>
            <div className="mt-4 text-sm text-zinc-300">全局热键</div>
            <input
              value={hotkey}
              onChange={(e) => setHotkey(e.target.value)}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
              placeholder="例如 Ctrl+Ctrl"
            />
            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
              />
              开机自启动
            </label>
            {saveMsg ? <div className="mt-3 text-xs text-zinc-400">{saveMsg}</div> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md bg-zinc-800 px-3 py-2 text-sm"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                关闭
              </button>
              <button
                className="rounded-md bg-zinc-200 px-3 py-2 text-sm text-zinc-900"
                onClick={async () => {
                  if (!isTauri()) return;
                  try {
                    const saved = await invoke<{ hotkey: string; autostart: boolean }>(
                      "update_settings",
                      {
                        hotkey,
                        autostart,
                      },
                    );
                    setHotkey(saved.hotkey);
                    setAutostart(saved.autostart);
                    setSaveMsg("已保存");
                  } catch (error) {
                    setSaveMsg(String(error));
                  }
                }}
                type="button"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

