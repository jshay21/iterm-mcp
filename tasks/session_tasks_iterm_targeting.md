# Session Tasks: iTerm Session Targeting

- [ ] **Goal:** Allow MCP server to target specific iTerm sessions via TTY path.
- [x] Modify `CommandExecutor.ts` to accept `targetTtyPath` and use targeted AppleScript.
- [x] Modify `TtyOutputReader.ts` to accept `ttyPath` and use targeted AppleScript.
- [x] Modify `SendControlCharacter.ts` to accept `targetTtyPath` and use targeted AppleScript.
- [x] Update tool schemas in `index.ts` to include optional `ttyPath` parameter.
- [x] Update request handler in `index.ts` to pass `ttyPath` to relevant components.
- [x] Fix various lint errors (escaping, implicit any).
- [ ] Install `@types/node` to fix module resolution errors. (Attempt failed)
- [ ] Verify `@modelcontextprotocol/sdk` types are correctly resolved after installing `@types/node`.
- [ ] Test the new functionality by calling tools with and without the `ttyPath` parameter.
