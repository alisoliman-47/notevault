import express from "express";
import cors from "cors";
import { dispatchVaultTool } from "./vault-tool-dispatcher.js";
import type { NoteMeta, ReadNoteResult, SearchHit, UpdateMode, VaultService } from "./vault/vault-service.js";

export function createHttpApp(vault: VaultService) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  /** Liveness for humans, CI, and reverse proxies — does not touch the filesystem. */
  app.get("/api/health", (_req, res) => {
    const root = vault.root;
    res.json({
      ok: true,
      service: "notevault",
      vault: { open: Boolean(root), root: root || null },
    });
  });

  app.post("/api/vault", async (req, res) => {
    try {
      const { path: root } = req.body as { path?: string };
      if (!root || typeof root !== "string") {
        res.status(400).json({ error: "body.path required" });
        return;
      }
      await vault.setRoot(root);
      const notes = (await dispatchVaultTool(vault, { tool: "list_notes" })) as NoteMeta[];
      res.json({ root: vault.root, noteCount: notes.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: msg });
    }
  });

  app.get("/api/vault", (_req, res) => {
    res.json({ root: vault.root });
  });

  app.get("/api/notes", async (_req, res) => {
    try {
      const notes = (await dispatchVaultTool(vault, { tool: "list_notes" })) as NoteMeta[];
      res.json(notes);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.get("/api/note", async (req, res) => {
    try {
      const p = String(req.query.path ?? "");
      if (!p) {
        res.status(400).json({ error: "query path required" });
        return;
      }
      const note = (await dispatchVaultTool(vault, { tool: "read_note", path: p })) as ReadNoteResult;
      res.json(note);
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  });

  app.post("/api/note", async (req, res) => {
    try {
      const { path: rel, content } = req.body as { path?: string; content?: string };
      if (!rel || typeof content !== "string") {
        res.status(400).json({ error: "path and content required" });
        return;
      }
      const created = (await dispatchVaultTool(vault, {
        tool: "create_note",
        path: rel,
        content,
      })) as { path: string };
      res.status(201).json(created);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.patch("/api/note", async (req, res) => {
    try {
      const { path: rel, content, mode } = req.body as {
        path?: string;
        content?: string;
        mode?: UpdateMode;
      };
      if (!rel || typeof content !== "string") {
        res.status(400).json({ error: "path and content required" });
        return;
      }
      const m: UpdateMode = mode === "append" ? "append" : "replace";
      const out = (await dispatchVaultTool(vault, {
        tool: "update_note",
        path: rel,
        content,
        mode: m,
      })) as { path: string };
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.delete("/api/note", async (req, res) => {
    try {
      const p = String(req.query.path ?? "");
      if (!p) {
        res.status(400).json({ error: "query path required" });
        return;
      }
      await dispatchVaultTool(vault, { tool: "delete_note", path: p });
      res.status(204).end();
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const q = String(req.query.q ?? "");
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const hits = (await dispatchVaultTool(vault, {
        tool: "search_notes",
        query: q,
        limit,
      })) as SearchHit[];
      res.json(hits);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.get("/api/backlinks", async (req, res) => {
    try {
      const p = String(req.query.path ?? "");
      if (!p) {
        res.status(400).json({ error: "query path required" });
        return;
      }
      const bl = (await dispatchVaultTool(vault, { tool: "list_backlinks", path: p })) as NoteMeta[];
      res.json(bl);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.post("/api/wiki/open", async (req, res) => {
    try {
      const { target } = req.body as { target?: string };
      if (!target) {
        res.status(400).json({ error: "target required" });
        return;
      }
      const { path } = (await dispatchVaultTool(vault, {
        tool: "open_wiki",
        target,
      })) as { path: string };
      res.json({ path });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  return app;
}
