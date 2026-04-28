import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchVaultTool } from "./vault-tool-dispatcher.js";
import type { NoteMeta, ReadNoteResult } from "./vault/vault-service.js";
import { VaultService } from "./vault/vault-service.js";

describe("dispatchVaultTool + VaultService (temp vault)", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("lists and reads notes", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "notevault-test-"));
    await writeFile(path.join(dir, "Alpha.md"), "# Alpha\n\nhello body", "utf8");
    const vault = new VaultService("");
    await vault.setRoot(dir);

    const notes = (await dispatchVaultTool(vault, { tool: "list_notes" })) as NoteMeta[];
    expect(notes.map((n) => n.path)).toContain("Alpha.md");

    const read = (await dispatchVaultTool(vault, { tool: "read_note", path: "Alpha.md" })) as ReadNoteResult;
    expect(read.path).toBe("Alpha.md");
    expect(read.content).toContain("hello body");
  });

  it("create, delete_note, and list_notes stay consistent", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "notevault-test-"));
    const vault = new VaultService("");
    await vault.setRoot(dir);

    await dispatchVaultTool(vault, {
      tool: "create_note",
      path: "tmp/Zeta.md",
      content: "z",
    });

    let notes = (await dispatchVaultTool(vault, { tool: "list_notes" })) as NoteMeta[];
    expect(notes.some((n) => n.path === "tmp/Zeta.md")).toBe(true);

    const del = await dispatchVaultTool(vault, { tool: "delete_note", path: "tmp/Zeta.md" });
    expect(del).toEqual({ path: "tmp/Zeta.md", deleted: true });

    notes = (await dispatchVaultTool(vault, { tool: "list_notes" })) as NoteMeta[];
    expect(notes.some((n) => n.path === "tmp/Zeta.md")).toBe(false);
  });

  it("search_notes finds content", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "notevault-test-"));
    await writeFile(path.join(dir, "FindMe.md"), "unique-needle-xyz", "utf8");
    const vault = new VaultService("");
    await vault.setRoot(dir);

    const hits = await dispatchVaultTool(vault, {
      tool: "search_notes",
      query: "unique-needle",
      limit: 5,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toBe("FindMe.md");
  });
});
