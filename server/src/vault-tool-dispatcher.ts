/**
 * Single dispatch layer for vault operations.
 *
 * The **six MCP tool names** from the brief map 1:1 to the first six cases below.
 * The HTTP UI also uses this module for **delete** and **wiki open** so Express
 * does not call `VaultService` methods ad hoc beside the shared six.
 */
import { ensureMdExtension } from "./vault/paths.js";
import type { NoteMeta, ReadNoteResult, SearchHit, UpdateMode, VaultService } from "./vault/vault-service.js";

/** Exact MCP tool names from the brief (snake_case). */
export const REQUIRED_VAULT_MCP_TOOLS = [
  "search_notes",
  "read_note",
  "create_note",
  "update_note",
  "list_backlinks",
  "list_notes",
] as const;

export type RequiredVaultMcpTool = (typeof REQUIRED_VAULT_MCP_TOOLS)[number];

/** Used by the web UI only; not exposed as MCP tools. */
export const HTTP_ONLY_VAULT_TOOLS = ["delete_note", "open_wiki"] as const;

export type VaultToolCall =
  | { tool: "list_notes" }
  | { tool: "read_note"; path: string }
  | { tool: "create_note"; path: string; content: string }
  | { tool: "update_note"; path: string; content: string; mode: UpdateMode }
  | { tool: "search_notes"; query: string; limit: number }
  | { tool: "list_backlinks"; path: string }
  | { tool: "delete_note"; path: string }
  | { tool: "open_wiki"; target: string };

export type VaultToolResult =
  | NoteMeta[]
  | ReadNoteResult
  | { path: string }
  | { path: string; deleted: true }
  | SearchHit[];

export async function dispatchVaultTool(vault: VaultService, call: VaultToolCall): Promise<VaultToolResult> {
  switch (call.tool) {
    case "list_notes":
      return vault.listNotes();
    case "read_note":
      return vault.readNote(call.path);
    case "create_note":
      return vault.createNote(call.path, call.content);
    case "update_note":
      return vault.updateNote(call.path, call.content, call.mode);
    case "search_notes":
      return vault.searchNotes(call.query, call.limit);
    case "list_backlinks":
      return vault.listBacklinks(call.path);
    case "delete_note": {
      const normalized = ensureMdExtension(call.path);
      await vault.deleteNote(call.path);
      return { path: normalized, deleted: true };
    }
    case "open_wiki": {
      const path = await vault.openOrCreateFromWiki(call.target);
      return { path };
    }
  }
}
