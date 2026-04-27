/**
 * Single implementation of the six required vault operations.
 * Both the MCP server and the HTTP API for the human UI dispatch through here
 * so there is one code path per tool (not two parallel implementations).
 */
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

export type VaultToolCall =
  | { tool: "list_notes" }
  | { tool: "read_note"; path: string }
  | { tool: "create_note"; path: string; content: string }
  | { tool: "update_note"; path: string; content: string; mode: UpdateMode }
  | { tool: "search_notes"; query: string; limit: number }
  | { tool: "list_backlinks"; path: string };

export type VaultToolResult =
  | NoteMeta[]
  | ReadNoteResult
  | { path: string }
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
  }
}
