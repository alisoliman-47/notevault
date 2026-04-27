# MCP

**Model Context Protocol** exposes tools like `list_notes`, `read_note`, and `search_notes` to an LLM host (for example Claude Desktop).

NoteVault wires those tools to the same code path as the React UI uses over HTTP, so the vault never "forks" into two behaviors.

## Related

- [[Projects/NoteVault Build]]
- [[Research/Take-home Constraints]]
