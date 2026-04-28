import { describe, expect, it } from "vitest";
import { HTTP_ONLY_VAULT_TOOLS, REQUIRED_VAULT_MCP_TOOLS } from "./vault-tool-dispatcher.js";

describe("vault tool catalog", () => {
  it("exposes exactly six MCP-mapped tool names", () => {
    expect(REQUIRED_VAULT_MCP_TOOLS).toHaveLength(6);
    expect(new Set(REQUIRED_VAULT_MCP_TOOLS).size).toBe(6);
  });

  it("documents HTTP-only dispatcher tools", () => {
    expect(HTTP_ONLY_VAULT_TOOLS).toEqual(["delete_note", "open_wiki"]);
  });
});
