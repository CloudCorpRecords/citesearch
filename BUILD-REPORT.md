# citesearch — Build Report

MCP Rebuild 1000 (Batch 9). Clean-room rebuild of
EdgePlat/edgepedia-mcp (rank 388, 0★, Tier C), built from the
docs-derived spec in `specs-batch9/edgepedia.md` (source repo
README read firsthand 2026-10-27, captured in
`harness/fixtures/edgepedia-mcp-tools-original.json`). No original
code was looked at, and no original server was probed; parity
proves the rebuild matches this program's defined spec, labelled
docs-derived. Local build only — nothing pushed or published.

Identity: repo `citesearch`, npm `@reneturcios/citesearch`,
MCP name `io.github.CloudCorpRecords/citesearch`, version `0.1.0`,
bin `citesearch` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `citesearch: dist/cli.js`, `mcpName` set,
  deps exactly sdk `^1` + zod `^3`, devDeps `@types/node ^20` /
  `tsx ^4` / `typescript ^5`,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Search, read and trace links across
  the Edgepedia encyclopedia corpus." = **70 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/citesearch:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/citesearch"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (`search`, `fetch`, `related`,
  `connect`, `resolve`, `mcp`, `--version`; exit 2 usage /
  1 runtime error), `src/mcp.ts`, `src/types.ts`,
  `src/citesearch.ts` (core logic, `VERSION = "0.1.0"`)
- `test/citesearch.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to citesearch)

Plus the fixture:
`harness/fixtures/edgepedia-mcp-tools-original.json`.

## Tools implemented (5)

`search` (`query`), `fetch` (`id`, optional `citations`),
`related` (`id`), `connect` (`from`, `to`), `resolve` (`name`,
optional `context`) — the full documented set, with schemas
exactly as the spec documents.

**Fetch in-tool omission, handled as directed:** the spec's
Returns text mentions up to 10 ids at once, one section, a token
budget, and passage matching for `fetch`, but publishes no
parameter names for those controls. No parameter names were
invented; the built schema is `id` + `citations` only. This is
recorded in the fixture `_source`, the README, and the CHANGELOG.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server`
  (`sdk/server/index.js` + `StdioServerTransport`) with explicit
  inputSchema literals exactly matching the fixture, per the
  standing fleet rule: `McpServer`'s zod-to-JSON-Schema conversion
  injects `$schema` / `additionalProperties` keys absent from the
  defined spec. Zod still validates every `tools/call`.
- Upstream contract (documented in the spec): the hosted server at
  `https://www.edgechat.ai/mcp` speaks MCP over Streamable HTTP,
  is read-only, and is key-free — no credential is read, required,
  or sent, so there is no missing-key path to implement.
- **Reconstruction (labelled):** the spec documents the endpoint
  and the tool/argument surface but prints no wire example, so each
  local operation forwards one JSON-RPC 2.0 `tools/call` POST to
  that endpoint, following the standard MCP Streamable HTTP
  contract. Responses may be a plain JSON document or a
  text/event-stream body whose `data:` lines carry JSON-RPC
  responses; both are parsed. The result's text `content` blocks
  are joined with newlines and returned verbatim; a JSON-RPC
  `error` payload or an `isError` result is raised as an error
  carrying its text. No article data is produced locally.
- Types were inferred only where the spec makes them obvious:
  `id` / `from` / `to` / `name` / `context` / `query` are strings
  (article IDs are opaque short strings, e.g. `ep9kcz7eym`), and
  `citations` is boolean (implied by the spec's `citations: false`
  example). Every named input not marked "(optional)" in the spec
  is required, per the spec's stated convention.
- Optional arguments are forwarded only when set: `citations` only
  when a boolean is given, `context` only when a non-blank string
  is given — so upstream defaults govern otherwise.
- Validation before any request: every wrapper rejects a blank
  required string locally, and the tests assert the fake fetch was
  never called in those cases. The CLI likewise validates its
  arguments (usage exit 2) before any fetch is issued. There is no
  credential check in this tool (key-free upstream).
- All HTTP access goes through an injectable `FetchFn`
  (types.ts), so tests run entirely on a fake fetch: no live
  network calls were made and no live behaviour is claimed.

## Verification (foreground, exact outputs)

### 1. Typecheck and build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ npm run build   # tsc -> dist/, including dist/cli.js
exit=0
```

### 2. Tests
```
$ npm test   # tsx --test test/*.test.ts
ℹ tests 22
ℹ pass 22
ℹ fail 0
```
Covers, on a recording fake fetch with canned bodies only:
`search` forwarding (endpoint `https://www.edgechat.ai/mcp`,
POST, `tools/call`, tool name + exact arguments) and query
trimming; `fetch` forwarding `id` alone, with `citations: false`,
and with `citations: true`; `related` / `connect` / `resolve`
forwarding, including `context` sent when given and omitted when
absent or blank; blank `query` / `id` / `from`-`to` / `name`
rejected with zero fetch calls; SSE body parsing with multiple
text blocks joined; `extractJsonPayloads` on plain JSON, empty,
and noisy SSE input; JSON-RPC error payloads, `isError` results,
empty/non-JSON bodies, HTTP 429, and a rejecting fetch each
raising the documented error; and an endpoint override being
honoured.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); no args, an unknown command, and
`search` with no query each print Usage and exit 2. MCP
`initialize` over stdio →
`serverInfo: {"name":"citesearch","version":"0.1.0"}`;
`tools/list` returned exactly the 5 tools with the fixture's
schemas. No live upstream call was made or claimed: tools/call
behaviour is proven against the fake fetch in the test suite only.

### 4. Parity (harness)
```
$ python3 ~/workspace/mcp-rebuild-100/harness/parity.py \
    --original ~/workspace/mcp-rebuild-100/harness/fixtures/edgepedia-mcp-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/citesearch/dist/cli.js mcp" \
    --out ~/workspace/mcp-rebuild-100/builds/citesearch/parity-out
verdict=PASS parity_pct=100.0 original_tools=5 rebuild_tools=5 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 5/5.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`, no `dist`),
offline `npm install --package-lock-only --ignore-scripts
--offline`, verified after generation — parses as JSON, top-level
`name` is `@reneturcios/citesearch`, version `0.1.0`,
`lockfileVersion` 3, **128 package entries** — then only the
lockfile was copied back. Local `node_modules` is a symlink to the
sibling burnmeter tree (`../burnmeter/node_modules`), used only
for the local build/test; it is gitignored and not part of the
lockfile generation.

## Gaps / honest notes

- Docs-derived spec: the README documents the five tool names,
  their inputs, and their return descriptions, but no wire example
  and no output schema, so parity proves the rebuild matches this
  program's defined spec (tool names + exact input schemas), not a
  hand-probed original. The JSON-RPC forwarding framing is a
  labelled reconstruction from the documented endpoint, recorded
  here and in the core module's header comment.
- The `fetch` extra controls (multiple ids, section, token
  budget, passage matching) are real documented behaviour with no
  published parameter names; they are omitted, not approximated.
- Corpus facts quoted in the README (486,198 articles, corpus
  release 1.8.0) are the upstream's own published figures, not
  independently verified by this build.
- No live Edgepedia call was performed or claimed; upstream rate
  limits (600/min, 100,000/day per IP) are documented upstream
  behaviour that this client does not separately enforce.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
