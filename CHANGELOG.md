# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI: `citesearch search`, `citesearch fetch` (with `--citations` /
  `--no-citations`), `citesearch related`, `citesearch connect`,
  `citesearch resolve` (with `--context`), and `citesearch mcp`.
- MCP server (`citesearch mcp`, stdio) with five read-only tools:
  `search`, `fetch`, `related`, `connect`, and `resolve`, using
  exactly the documented inputs.
- Every operation forwards one JSON-RPC `tools/call` request to the
  hosted, key-free Edgepedia endpoint at
  `https://www.edgechat.ai/mcp`; plain-JSON and text/event-stream
  responses are both parsed, and upstream error results are raised
  as errors carrying their text.
- The documented extra `fetch` controls (multiple ids, a section, a
  token budget, passage matching) publish no parameter names, so
  none were invented: `fetch` sends only `id` and, when set,
  `citations`.
- All HTTP access goes through an injectable fetch function, so the
  test suite runs entirely on fake-fetch fixtures with no network.
