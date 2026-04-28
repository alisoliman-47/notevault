import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import * as api from "./api";
import type { NoteMeta, SearchHit } from "./api";
import { wikiLinksToMarkdown } from "./wiki-md";

const LS_VAULT = "notevault:lastVaultPath";

/** react-markdown strips unknown URL schemes; wiki links must be allowed through. */
function urlTransform(url: string) {
  if (url.startsWith("wiki:")) return url;
  return defaultUrlTransform(url);
}

function treeFromNotes(notes: NoteMeta[]): NoteMeta[] {
  return [...notes].sort((a, b) => a.path.localeCompare(b.path));
}

export function App() {
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem(LS_VAULT) ?? "");
  const [vaultOpen, setVaultOpen] = useState(false);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [editor, setEditor] = useState("");
  const [backlinks, setBacklinks] = useState<NoteMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [paletteHits, setPaletteHits] = useState<SearchHit[]>([]);
  const [paletteIdx, setPaletteIdx] = useState(0);

  const refreshNotes = useCallback(async () => {
    const n = await api.listNotes();
    setNotes(n);
    return n;
  }, []);

  const openVault = useCallback(async () => {
    setError(null);
    try {
      await api.openVault(vaultPath.trim());
      localStorage.setItem(LS_VAULT, vaultPath.trim());
      setVaultOpen(true);
      await refreshNotes();
    } catch (e) {
      setVaultOpen(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [vaultPath, refreshNotes]);

  const loadNote = useCallback(async (path: string) => {
    setError(null);
    try {
      const n = await api.readNote(path);
      setActivePath(n.path);
      setEditor(n.content);
      const bl = await api.listBacklinks(n.path);
      setBacklinks(bl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const saveActive = useCallback(async () => {
    if (!activePath) return;
    setError(null);
    try {
      await api.updateNote(activePath, editor, "replace");
      await refreshNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [activePath, editor, refreshNotes]);

  const deleteActive = useCallback(async () => {
    if (!activePath) return;
    if (!confirm(`Delete ${activePath}?`)) return;
    setError(null);
    try {
      await api.deleteNote(activePath);
      setActivePath(null);
      setEditor("");
      setBacklinks([]);
      await refreshNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [activePath, refreshNotes]);

  const newNote = useCallback(async () => {
    const name = prompt("New note path (relative to vault), e.g. Ideas/New.md", "Inbox/New note.md");
    if (!name) return;
    setError(null);
    try {
      await api.createNote(name, `# ${name.replace(/\.md$/i, "").split("/").pop()}\n\n`);
      await refreshNotes();
      await loadNote(name.endsWith(".md") ? name : `${name}.md`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadNote, refreshNotes]);

  const onWikiClick = useCallback(
    async (e: React.MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      const href = a?.getAttribute("href") ?? "";
      if (!href.startsWith("wiki:")) return;
      e.preventDefault();
      const encoded = href.slice("wiki:".length);
      let raw: string;
      try {
        raw = decodeURIComponent(encoded);
      } catch {
        raw = encoded;
      }
      setError(null);
      try {
        const { path } = await api.openWikiTarget(raw);
        await refreshNotes();
        await loadNote(path);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadNote, refreshNotes],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const meta = ev.metaKey || ev.ctrlKey;
      if (meta && ev.key.toLowerCase() === "p") {
        ev.preventDefault();
        setPalette(true);
        setPaletteQ("");
        setPaletteHits([]);
        setPaletteIdx(0);
      }
      if (meta && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive]);

  useEffect(() => {
    if (!palette) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const hits = await api.searchNotes(paletteQ, 15);
          setPaletteHits(hits);
          setPaletteIdx(0);
        } catch {
          setPaletteHits([]);
        }
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [palette, paletteQ]);

  const previewMd = useMemo(() => wikiLinksToMarkdown(editor), [editor]);
  const sorted = useMemo(() => treeFromNotes(notes), [notes]);

  return (
    <div className="layout">
      <header className="topbar" role="banner">
        <div className="topbar-brand">
          <span className="brand-mark">NoteVault</span>
        </div>
        <div className="topbar-path">
          <span className="topbar-label">Vault</span>
          <input
            type="text"
            placeholder="/absolute/path/to/folder"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            aria-label="Vault folder path"
          />
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn btn-primary" onClick={() => void openVault()}>
            Open
          </button>
          <button type="button" className="btn" onClick={() => void newNote()} disabled={!vaultOpen}>
            New note
          </button>
          <button type="button" className="btn" onClick={() => void saveActive()} disabled={!activePath}>
            Save
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void deleteActive()} disabled={!activePath}>
            Delete
          </button>
        </div>
        <span className="topbar-hint">⌘P search · ⌘S save</span>
        {error ? <span className="topbar-error">{error}</span> : null}
      </header>

      <aside className="sidebar" aria-label="Note library">
        {!vaultOpen ? (
          <p className="hint sidebar-empty">Open a vault to list notes.</p>
        ) : (
          <>
            <div className="sidebar-header">
              <span className="sidebar-title">Library</span>
              <span className="sidebar-count">{sorted.length}</span>
            </div>
            <div className="sidebar-scroll" role="list" aria-label="Notes">
              {sorted.map((n) => (
                <div
                  key={n.path}
                  role="listitem"
                  tabIndex={0}
                  className={`tree-item${n.path === activePath ? " active" : ""}${n.path.includes("/") ? " nested" : ""}`}
                  style={{ paddingLeft: `${0.5 + n.path.split("/").length * 0.4}rem` }}
                  aria-current={n.path === activePath ? "true" : undefined}
                  onClick={() => void loadNote(n.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void loadNote(n.path);
                    }
                  }}
                  title={n.path}
                >
                  {n.title}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <main className="main">
        <section className="pane">
          <div className="pane-header">
            <h2>Markdown</h2>
          </div>
          <div className="editor-area">
            <textarea
              value={editor}
              onChange={(e) => setEditor(e.target.value)}
              placeholder={activePath ? "" : "Select a note"}
              spellCheck={false}
              aria-label={activePath ? `Edit ${activePath}` : "Markdown editor"}
            />
          </div>
        </section>
        <section className="pane" onClick={onWikiClick}>
          <div className="pane-header">
            <h2>Preview</h2>
          </div>
          <div className="preview">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={urlTransform}
              components={{
                a: ({ href, children, ...props }) =>
                  href?.startsWith("wiki:") ? (
                    <a {...props} href={href} className="wiki">
                      {children}
                    </a>
                  ) : (
                    <a {...props} href={href}>
                      {children}
                    </a>
                  ),
              }}
            >
              {previewMd}
            </ReactMarkdown>
          </div>
        </section>
      </main>

      <aside className="backlinks" aria-label="Backlinks">
        <div className="backlinks-header">
          <h2>Backlinks</h2>
          {activePath ? <div className="backlinks-active">{activePath}</div> : null}
        </div>
        <div className="backlinks-body">
          {activePath ? (
            backlinks.length === 0 ? (
              <p className="hint">None</p>
            ) : (
              <ul>
                {backlinks.map((b) => (
                  <li
                    key={b.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => void loadNote(b.path)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void loadNote(b.path);
                      }
                    }}
                  >
                    {b.title}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="hint">Open a note</p>
          )}
        </div>
      </aside>

      {palette ? (
        <div
          className="palette-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPalette(false);
          }}
        >
          <div className="palette" role="dialog" aria-modal="true" aria-label="Search notes">
            <div className="palette-head" id="palette-title">
              Search vault
            </div>
            <input
              id="palette-query"
              autoFocus
              placeholder="Type to filter notes…"
              value={paletteQ}
              onChange={(e) => setPaletteQ(e.target.value)}
              aria-labelledby="palette-title"
              aria-controls="palette-results"
              aria-autocomplete="list"
              aria-expanded={paletteHits.length > 0}
              onKeyDown={(e) => {
                if (e.key === "Escape") setPalette(false);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setPaletteIdx((i) => Math.min(i + 1, Math.max(0, paletteHits.length - 1)));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setPaletteIdx((i) => Math.max(i - 1, 0));
                }
                if (e.key === "Enter" && paletteHits[paletteIdx]) {
                  const hit = paletteHits[paletteIdx];
                  setPalette(false);
                  void loadNote(hit.path);
                }
              }}
            />
            <ul id="palette-results" role="listbox" aria-label="Matching notes">
              {paletteHits.map((h, i) => (
                <li
                  key={h.path}
                  role="option"
                  aria-selected={i === paletteIdx}
                  className={i === paletteIdx ? "sel" : ""}
                  onMouseEnter={() => setPaletteIdx(i)}
                  onClick={() => {
                    setPalette(false);
                    void loadNote(h.path);
                  }}
                >
                  <div className="path">{h.path}</div>
                  <div className="snip">{h.snippet}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
