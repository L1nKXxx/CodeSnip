"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { codeToHtml } from "@/lib/highlight";
import { guessLanguage } from "@/lib/langDetect";
import { isTauri } from "@/lib/tauri";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const scrollbarClass =
  "[scrollbar-width:thin] [scrollbar-color:rgba(161,161,170,0.65)_rgba(39,39,42,0.45)] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-900/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-500/65 [&::-webkit-scrollbar-thumb:hover]:bg-zinc-400/75 [&::-webkit-scrollbar-corner]:bg-zinc-900/40";

export default function StickyCard() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLPreElement | null>(null);
  const lastCtrlAtRef = useRef<number>(0);
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
    const measureEl = measureRef.current;
    if (!measureEl) return;
    const rect = measureEl.getBoundingClientRect();
    const nextWidth = Math.max(860, Math.ceil(rect.width) + 64);
    const nextHeight = Math.max(560, Math.ceil(rect.height) + 64);
    setContentSize((prev) => {
      if (prev.width === nextWidth && prev.height === nextHeight) return prev;
      return { width: nextWidth, height: nextHeight };
    });
  }, [manualInput]);

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
      window.setTimeout(() => inputRef.current?.focus(), 0);
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
      window.setTimeout(() => inputRef.current?.focus(), 0);
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

  return (
    <div
      className="relative select-none"
      onDoubleClick={(e) => {
        e.preventDefault();
        void closeWindow();
      }}
    >
      <pre
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 m-0 whitespace-pre font-mono text-sm leading-6 opacity-0"
      >
        {manualInput || " "}
      </pre>
      <div
        className="origin-top-left bg-zinc-900/95 transition-[opacity,width,height] duration-75"
        style={{
          opacity,
          width: `${contentSize.width * scale}px`,
          height: `${contentSize.height * scale}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 z-10 h-7 w-full cursor-move"
          data-tauri-drag-region
          title="拖动窗口"
        />
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
            ref={previewRef}
            className="h-full overflow-hidden bg-zinc-900/95 p-8"
          >
            {html ? (
              <div
                className={[
                  "text-base",
                  "leading-7",
                  "[&_.shiki]:!bg-transparent",
                  "[&_.shiki]:p-0",
                  "[&_.shiki]:m-0",
                  "[&_.shiki_pre]:m-0",
                  "[&_.shiki_pre]:bg-transparent",
                  "[&_.shiki_pre]:overflow-auto",
                  "[&_.shiki_code]:font-mono",
                ].join(" ")}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-zinc-500">
                等待粘贴代码...
              </div>
            )}
            {highlightError && (
              <div className="mt-2 rounded-md bg-red-900/20 p-2 text-xs text-red-400">
                代码高亮错误: {highlightError}
              </div>
            )}
          </div>
          <textarea
            ref={inputRef}
            autoFocus
            className={`absolute inset-0 h-full w-full resize-none overflow-scroll bg-transparent p-8 pt-10 font-mono text-base leading-7 text-transparent caret-zinc-100 outline-none selection:bg-zinc-500/40 ${scrollbarClass}`}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onWheel={(e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY;
                setScale((s) => clamp(s + (delta > 0 ? -0.05 : 0.05), 0.25, 3));
                return;
              }
              if (e.shiftKey) {
                e.preventDefault();
                const delta = e.deltaY;
                setOpacity((o) => clamp(o + (delta > 0 ? -0.08 : 0.08), 0, 1));
              }
            }}
            onScroll={(e) => {
              if (!previewRef.current) return;
              previewRef.current.scrollTop = e.currentTarget.scrollTop;
              previewRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="粘贴代码到这里实时预览"
            data-tauri-drag-region={false}
          />
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

