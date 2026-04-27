/**
 * Option B from the brief: a small custom agent that talks to NoteVault over MCP (stdio).
 * Option A remains Claude Desktop → configure it to run server/mcp-launch.js (see README).
 *
 * Usage:
 *   NOTEVAULT_ROOT=/abs/path/to/vault ANTHROPIC_API_KEY=... npm run agent-demo -w server
 *   NOTEVAULT_ROOT=... OPENAI_API_KEY=... npm run agent-demo -w server
 *   NOTEVAULT_ROOT=... npm run agent-demo -w server -- --smoke   # no API key; MCP tool smoke only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "..");
/** Prefer mcp-launch.js so dist/ is rebuilt when src/ is newer than dist/mcp-stdio.js. */
const MCP_ENTRY = path.join(SERVER_ROOT, "mcp-launch.js");

const MAX_LLM_TURNS = 12;

function mcpServerPath(): string {
  if (!fs.existsSync(MCP_ENTRY)) {
    console.error(`Missing ${MCP_ENTRY}.`);
    process.exit(1);
  }
  return MCP_ENTRY;
}

async function connectMcpClient(vaultRoot: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [mcpServerPath()],
    env: { ...process.env, NOTEVAULT_ROOT: vaultRoot },
    stderr: "inherit",
  });
  const client = new Client({ name: "notevault-agent-demo", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

function textFromToolResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if ("content" in result && Array.isArray(result.content)) {
    return result.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text" && "text" in b)
      .map((b) => b.text)
      .join("\n");
  }
  return JSON.stringify(result);
}

async function smokeMcpDemo(client: Client): Promise<void> {
  console.log("\n--- MCP smoke (no LLM): list → read → write + wiki link ---\n");
  const listed = await client.callTool({ name: "list_notes", arguments: {} });
  console.log("list_notes:", textFromToolResult(listed).slice(0, 500));

  const read = await client.callTool({ name: "read_note", arguments: { path: "Start Here.md" } });
  console.log("read_note Start Here.md:", textFromToolResult(read).slice(0, 400));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const demoPath = `Agent/.agent-demo-${stamp}.md`;
  const body = `# Agent demo (automated)\n\nLinked hub: [[Start Here]]\n`;
  const created = await client.callTool({
    name: "create_note",
    arguments: { path: demoPath, content: body },
  });
  console.log("create_note:", textFromToolResult(created));

  const verify = await client.callTool({ name: "read_note", arguments: { path: demoPath } });
  console.log("read_note verify:", textFromToolResult(verify).slice(0, 500));
  console.log("\nSmoke finished. You can delete", demoPath, "from the vault if you like.\n");
}

function mcpToolToAnthropicInputSchema(tool: Tool): Record<string, unknown> {
  const s = tool.inputSchema as Record<string, unknown> | undefined;
  if (s && typeof s === "object" && s.type === "object") return s;
  return { type: "object", properties: {}, additionalProperties: true };
}

async function runAnthropicAgent(client: Client, tools: Tool[], task: string): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: mcpToolToAnthropicInputSchema(t),
  }));

  type Msg = { role: "user" | "assistant"; content: unknown };
  const messages: Msg[] = [{ role: "user", content: task }];

  const system = `You control a local markdown vault via MCP tools only. Prefer small, reversible edits.
Use wiki links as [[Note Title]] or [[Folder/Note]] when asked to link notes.
When done, reply with a one-paragraph summary of tool calls you made.`;

  for (let turn = 0; turn < MAX_LLM_TURNS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        tools: anthropicTools,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 800)}`);
    }

    const data = (await res.json()) as {
      stop_reason?: string;
      content?: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      >;
    };

    const blocks = data.content ?? [];
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");

    if (toolUses.length === 0) {
      const text = blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      console.log("\nAgent finished:\n", text || "(no text)");
      return;
    }

    const toolResults: unknown[] = [];
    for (const tu of toolUses) {
      console.log(`\n→ MCP tool ${tu.name}`, JSON.stringify(tu.input));
      const out = await client.callTool({ name: tu.name, arguments: tu.input });
      const payload = textFromToolResult(out);
      if ("isError" in out && out.isError) {
        console.log("  (tool error)", payload.slice(0, 400));
      } else {
        console.log("  ←", payload.slice(0, 400) + (payload.length > 400 ? "…" : ""));
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: [{ type: "text", text: payload }],
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Exceeded ${MAX_LLM_TURNS} LLM turns without completion`);
}

function mcpToolToOpenAiParameters(tool: Tool): Record<string, unknown> {
  const s = tool.inputSchema as Record<string, unknown> | undefined;
  if (s && typeof s === "object") return s;
  return { type: "object", properties: {}, additionalProperties: true };
}

async function runOpenAiAgent(client: Client, tools: Tool[], task: string): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: mcpToolToOpenAiParameters(t),
    },
  }));

  type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content?: unknown; tool_calls?: unknown; tool_call_id?: string; name?: string };
  const chatMessages: ChatMsg[] = [
    {
      role: "system",
      content:
        "You control a local markdown vault via function tools only. Use wiki links [[Title]] when linking. Summarize when done.",
    },
    { role: "user", content: task },
  ];

  for (let turn = 0; turn < MAX_LLM_TURNS; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        tools: openaiTools,
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 800)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("OpenAI: empty choices");

    chatMessages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: msg.tool_calls,
    });

    if (!msg.tool_calls?.length) {
      console.log("\nAgent finished:\n", msg.content ?? "");
      return;
    }

    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      console.log(`\n→ MCP tool ${tc.function.name}`, JSON.stringify(args));
      const out = await client.callTool({ name: tc.function.name, arguments: args });
      const payload = textFromToolResult(out);
      console.log("  ←", payload.slice(0, 400) + (payload.length > 400 ? "…" : ""));
      chatMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: payload,
      });
    }
  }

  throw new Error(`Exceeded ${MAX_LLM_TURNS} LLM turns without completion`);
}

async function main() {
  const vaultRoot = process.env.NOTEVAULT_ROOT?.trim();
  if (!vaultRoot) {
    console.error("Set NOTEVAULT_ROOT to an absolute path to your vault (e.g. seed-vault).");
    process.exit(1);
  }

  const smoke = process.argv.includes("--smoke");
  const client = await connectMcpClient(vaultRoot);

  try {
    if (smoke) {
      await smokeMcpDemo(client);
      return;
    }

    const { tools } = await client.listTools();
    if (!tools?.length) throw new Error("MCP server returned no tools");

    const task =
      process.env.AGENT_TASK?.trim() ??
      [
        "Using the vault tools:",
        "1) Call list_notes.",
        "2) Read `Start Here.md` (or the first reasonable hub note you find).",
        "3) Create or update a note at `Agent/LLM Demo.md` that briefly summarizes what you read and includes at least one Obsidian-style wiki link [[...]] to another existing note in the vault.",
        "Keep edits short. Prefer create_note if the file likely does not exist; otherwise update_note with mode replace.",
      ].join(" ");

    if (process.env.ANTHROPIC_API_KEY) {
      console.log("Using Anthropic API + MCP (set ANTHROPIC_MODEL to override default).");
      await runAnthropicAgent(client, tools as Tool[], task);
    } else if (process.env.OPENAI_API_KEY) {
      console.log("Using OpenAI API + MCP (set OPENAI_MODEL to override default).");
      await runOpenAiAgent(client, tools as Tool[], task);
    } else {
      console.error(
        "No ANTHROPIC_API_KEY or OPENAI_API_KEY set.\n\n" +
          "Options:\n" +
          "  • Claude Desktop (Option A): point MCP at server/mcp-launch.js — see README.\n" +
          "  • This script (Option B): export ANTHROPIC_API_KEY or OPENAI_API_KEY and re-run.\n" +
          "  • MCP wiring check only: npm run agent-demo -w server -- --smoke\n",
      );
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
