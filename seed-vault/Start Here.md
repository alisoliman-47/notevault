---
type: hub
---

# Start Here

Welcome to the **NoteVault** seed vault. This folder ships ~10 linked notes so evaluators can try the human UI and MCP tools quickly.

## Map

- [[Projects/NoteVault Build]] — scope and architecture for this take-home
- [[Concepts/MCP]] — why the agent speaks the same API as the UI
- [[Concepts/Wiki Links Demo]] — examples of `[[wiki links]]`
- [[People/Alice]] and [[People/Bob]] — sample people notes
- [[Journal/2026-04-27]] — dated entry
- [[Research/Take-home Constraints]] — what shipped vs cut
- [[Inbox/Quick Capture]] — short scratch note
- [[Inbox/MCP Notes]] — short reflection linking back into [[Concepts/MCP]]
- [[Archive/Old Idea]] — link target for backlinks

Open [[Projects/NoteVault Build]] next.

## About MCP

The Model Context Protocol ([[Concepts/MCP]]) is the backbone of how this vault exposes structured tools to an AI agent. Rather than relying on ad-hoc prompting, MCP defines a clean, versioned API surface so that operations like listing notes, reading content, and creating or updating entries all happen through explicit tool calls — keeping the agent's behaviour predictable and auditable. If you want to understand why the vault is built the way it is, [[Concepts/MCP]] is the right place to start.
