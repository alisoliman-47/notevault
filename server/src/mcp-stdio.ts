import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VaultService } from "./vault/vault-service.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errResult(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

async function main() {
  const root = process.env.NOTEVAULT_ROOT;
  if (!root?.trim()) {
    console.error("NOTEVAULT_ROOT must point to your vault folder (absolute path recommended).");
    process.exit(1);
  }

  const vault = new VaultService("");
  await vault.setRoot(path.resolve(root));

  const server = new McpServer({ name: "notevault", version: "0.1.0" });

  server.registerTool(
    "list_notes",
    {
      description: "Inventory of all markdown notes (path + title).",
      inputSchema: z.object({}),
    },
    async (_args) => jsonResult(await vault.listNotes()),
  );

  server.registerTool(
    "read_note",
    {
      description: "Read full markdown body and parsed frontmatter for a vault-relative path.",
      inputSchema: z.object({
        path: z.string().describe("Vault-relative path, e.g. Projects/Plan.md"),
      }),
    },
    async ({ path: rel }) => {
      try {
        return jsonResult(await vault.readNote(rel));
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "create_note",
    {
      description: "Create a new note. Fails if the file already exists.",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
      }),
    },
    async ({ path: rel, content }) => {
      try {
        return jsonResult(await vault.createNote(rel, content));
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "update_note",
    {
      description: "Replace entire note content, or append to the end.",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
        mode: z.enum(["replace", "append"]).default("replace"),
      }),
    },
    async ({ path: rel, content, mode }) => {
      try {
        return jsonResult(await vault.updateNote(rel, content, mode));
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "search_notes",
    {
      description: "Ranked full-text search over note bodies with short snippets.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(50).optional().default(10),
      }),
    },
    async ({ query, limit }) => jsonResult(await vault.searchNotes(query, limit ?? 10)),
  );

  server.registerTool(
    "list_backlinks",
    {
      description: "Notes that link to the given note via [[wiki links]] resolving to this path.",
      inputSchema: z.object({ path: z.string() }),
    },
    async ({ path: rel }) => {
      try {
        return jsonResult(await vault.listBacklinks(rel));
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
