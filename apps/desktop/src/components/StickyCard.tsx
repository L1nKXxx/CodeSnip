"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { codeToHtml } from "@/lib/highlight";
import { guessLanguage } from "@/lib/langDetect";
import { isTauri } from "@/lib/tauri";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const MIN_SCALE = 0.55;
const MAX_SCALE = 10.0;
const BASE_WIDTH = 860;
const BASE_HEIGHT = 560;
const modifierOptions = ["Ctrl", "Alt", "Shift"] as const;
type ModifierKey = (typeof modifierOptions)[number];

const isModifierPressed = (e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, mod: ModifierKey) =>
  (mod === "Ctrl" && e.ctrlKey) || (mod === "Alt" && e.altKey) || (mod === "Shift" && e.shiftKey);

const isExactAltLeftDrag = (e: {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
  button: number;
}) => e.altKey && !e.ctrlKey && !e.shiftKey && !Boolean(e.metaKey) && e.button === 0;

const tryStartDragging = async () => {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.error("startDragging failed:", error);
  }
};
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

function insertPlainTextAtSelection(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function makeTxtFilename() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `codesnip-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;
}

export default function StickyCard() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLPreElement | null>(null);
  const dragLockRef = useRef(false);
  const lastCtrlAtRef = useRef<number>(0);
  const pendingCaretRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{ top: number; left: number } | null>(null);
  const [manualInput, setManualInput] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [highlightError, setHighlightError] = useState<string>("");
  const [scale, setScale] = useState<number>(1);
  const [opacity, setOpacity] = useState<number>(1);
  const [contentSize, setContentSize] = useState<{ width: number; height: number }>({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl+Ctrl");
  const [autostart, setAutostart] = useState(false);
  const [dragModifier, setDragModifier] = useState<ModifierKey>("Alt");
  const [zoomModifier, setZoomModifier] = useState<ModifierKey>("Ctrl");
  const [opacityModifier, setOpacityModifier] = useState<ModifierKey>("Shift");
  const [dragModifierPressed, setDragModifierPressed] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const effectiveLang = useMemo(() => guessLanguage(manualInput), [manualInput]);
  const saveAsTxt = useCallback(async () => {
    const text = manualInput ?? "";
    const suggestedName = makeTxtFilename();
    if (isTauri()) {
      try {
        const savedPath = await invoke<string>("save_text_file", {
          text,
          suggestedName,
        });
        setSaveMsg(`已保存：${savedPath}`);
        return;
      } catch (error) {
        const message = String(error);
        if (message.includes("用户已取消保存")) {
          return;
        }
        setSaveMsg(`保存失败：${message}`);
        return;
      }
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSaveMsg("已导出为 TXT");
  }, [manualInput]);

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
    // Update Tauri window size when scale changes
    if (isTauri()) {
      void (async () => {
        try {
          const win = getCurrentWindow();
          const newWidth = Math.max(BASE_WIDTH, BASE_WIDTH * scale);
          const newHeight = Math.max(BASE_HEIGHT, BASE_HEIGHT * scale);
          await win.setSize(new PhysicalSize(Math.round(newWidth), Math.round(newHeight)));
        } catch (error) {
          console.error("setSize failed:", error);
        }
      })();
    }
  }, [scale]);

  useEffect(() => {
    const releaseDragLock = () => {
      dragLockRef.current = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!isTauri()) return;
      if (settingsOpen) return;
      if (!isExactAltLeftDrag(e)) return;
      const target = e.target as Node | null;
      if (!target || !rootRef.current?.contains(target)) return;
      if (dragLockRef.current) return;
      dragLockRef.current = true;
      e.preventDefault();
      void (async () => {
        try {
          await tryStartDragging();
        } finally {
          dragLockRef.current = false;
        }
      })();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) {
        releaseDragLock();
      }
    };
    window.addEventListener("pointerup", releaseDragLock, true);
    window.addEventListener("mouseup", releaseDragLock, true);
    window.addEventListener("blur", releaseDragLock);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", releaseDragLock, true);
      window.removeEventListener("mouseup", releaseDragLock, true);
      window.removeEventListener("blur", releaseDragLock);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "s" && e.key !== "S") return;
      if (e.repeat) return;
      e.preventDefault();
      void saveAsTxt();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveAsTxt]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isTauri()) return;
      try {
        const settings = await invoke<{
          hotkey: string;
          autostart: boolean;
          dragModifier?: ModifierKey;
          zoomModifier?: ModifierKey;
          opacityModifier?: ModifierKey;
        }>("get_settings");
        if (cancelled) return;
        setHotkey(settings.hotkey || "Ctrl+Ctrl");
        setAutostart(Boolean(settings.autostart));
        setDragModifier(
          modifierOptions.includes(settings.dragModifier as ModifierKey)
            ? (settings.dragModifier as ModifierKey)
            : "Alt",
        );
        setZoomModifier(
          modifierOptions.includes(settings.zoomModifier as ModifierKey)
            ? (settings.zoomModifier as ModifierKey)
            : "Ctrl",
        );
        setOpacityModifier(
          modifierOptions.includes(settings.opacityModifier as ModifierKey)
            ? (settings.opacityModifier as ModifierKey)
            : "Shift",
        );
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
    const onKeyStateChange = (e: KeyboardEvent) => {
      setDragModifierPressed(e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey);
    };
    const onBlur = () => setDragModifierPressed(false);
    window.addEventListener("keydown", onKeyStateChange);
    window.addEventListener("keyup", onKeyStateChange);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyStateChange);
      window.removeEventListener("keyup", onKeyStateChange);
      window.removeEventListener("blur", onBlur);
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
          const isFocused = await win.isFocused();

          if (isFocused) {
            return;
          }

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
      // Double-press Ctrl to paste-from-clipboard.
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
      ref={rootRef}
      className="relative block select-none pointer-events-none"
      onDoubleClick={(e) => {
        if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
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
        className={`origin-top-left bg-transparent transition-opacity duration-75 pointer-events-auto ${dragModifierPressed ? "cursor-move" : ""}`}
        style={{
          opacity,
          width: `${contentSize.width * scale}px`,
          height: `${contentSize.height * scale}px`,
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
            "whitespace-pre",
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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              insertPlainTextAtSelection("\n");
              const current = e.currentTarget;
              pendingScrollRef.current = { top: current.scrollTop, left: current.scrollLeft };
              pendingCaretRef.current = getCaretOffset(current);
              setManualInput(current.innerText.replace(/\r/g, ""));
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              insertPlainTextAtSelection("  ");
              const current = e.currentTarget;
              pendingScrollRef.current = { top: current.scrollTop, left: current.scrollLeft };
              pendingCaretRef.current = getCaretOffset(current);
              setManualInput(current.innerText.replace(/\r/g, ""));
            }
          }}
          onWheel={(e) => {
            if (isModifierPressed(e, zoomModifier)) {
              e.preventDefault();
              const delta = e.deltaY;
              setScale((s) => clamp(s + (delta > 0 ? -0.06 : 0.06), MIN_SCALE, MAX_SCALE));
              return;
            }
            if (isModifierPressed(e, opacityModifier)) {
              e.preventDefault();
              e.stopPropagation();
              const delta = e.deltaY;
              setOpacity((o) => clamp(o + (delta > 0 ? -0.08 : 0.08), 0, 1));
              return;
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
            <div className="mt-4 text-sm text-zinc-300">拖动窗口快捷键（+ 左键）</div>
            <select
              value={dragModifier}
              onChange={(e) => setDragModifier(e.target.value as ModifierKey)}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
            >
              {modifierOptions.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
            <div className="mt-4 text-sm text-zinc-300">缩放快捷键（+ 滚轮）</div>
            <select
              value={zoomModifier}
              onChange={(e) => setZoomModifier(e.target.value as ModifierKey)}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
            >
              {modifierOptions.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
            <div className="mt-4 text-sm text-zinc-300">透明度快捷键（+ 滚轮）</div>
            <select
              value={opacityModifier}
              onChange={(e) => setOpacityModifier(e.target.value as ModifierKey)}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
            >
              {modifierOptions.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
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
                    const saved = await invoke<{
                      hotkey: string;
                      autostart: boolean;
                      dragModifier: ModifierKey;
                      zoomModifier: ModifierKey;
                      opacityModifier: ModifierKey;
                    }>(
                      "update_settings",
                      {
                        hotkey,
                        autostart,
                        dragModifier,
                        zoomModifier,
                        opacityModifier,
                      },
                    );
                    setHotkey(saved.hotkey);
                    setAutostart(saved.autostart);
                    setDragModifier(saved.dragModifier);
                    setZoomModifier(saved.zoomModifier);
                    setOpacityModifier(saved.opacityModifier);
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

