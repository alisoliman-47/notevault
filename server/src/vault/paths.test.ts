import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureMdExtension, normalizeVaultPath, toFsPath } from "./paths.js";

describe("normalizeVaultPath", () => {
  it("trims and uses forward slashes", () => {
    expect(normalizeVaultPath("  A\\\\B.md  ")).toBe("A/B.md");
  });

  it("strips leading slashes", () => {
    expect(normalizeVaultPath("/x/y.md")).toBe("x/y.md");
  });

  it("rejects path traversal", () => {
    expect(() => normalizeVaultPath("a/../b")).toThrow(/traversal/);
  });

  it("skips dot segments", () => {
    expect(normalizeVaultPath("./x/./y.md")).toBe("x/y.md");
  });
});

describe("ensureMdExtension", () => {
  it("appends .md when missing", () => {
    expect(ensureMdExtension("Inbox/Todo")).toBe("Inbox/Todo.md");
  });

  it("preserves existing extension case-insensitively", () => {
    expect(ensureMdExtension("Note.MD")).toBe("Note.MD");
  });
});

describe("toFsPath", () => {
  it("joins vault root and relative path", () => {
    expect(toFsPath("/vault", "a/b.md")).toBe(path.join("/vault", "a", "b.md"));
  });
});
