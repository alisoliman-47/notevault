import express from "express";
import cors from "cors";
import type { UpdateMode, VaultService } from "./vault/vault-service.js";
import { ensureMdExtension } from "./vault/paths.js";

export function createHttpApp(vault: VaultService) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.post("/api/vault", async (req, res) => {
    try {
      const { path: root } = req.body as { path?: string };
      if (!root || typeof root !== "string") {
        res.status(400).json({ error: "body.path required" });
        return;
      }
      await vault.setRoot(root);
      const notes = await vault.listNotes();
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
      const notes = await vault.listNotes();
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
      const note = await vault.readNote(p);
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
      const created = await vault.createNote(rel, content);
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
      const out = await vault.updateNote(rel, content, m);
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
      await vault.deleteNote(p);
      res.status(204).end();
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const q = String(req.query.q ?? "");
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const hits = await vault.searchNotes(q, limit);
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
      const bl = await vault.listBacklinks(ensureMdExtension(p));
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
      const path = await vault.openOrCreateFromWiki(target);
      res.json({ path });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  return app;
}
