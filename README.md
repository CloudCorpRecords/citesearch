# citesearch

citesearch is a small client for Edgepedia, a standalone
encyclopedia corpus of (per its own release notes) some 486,000
articles, each with its own id and credit line. It can search the
corpus by subject, read an article or topic in full, list the
articles related to one you already have, trace the chain of
in-text links between two articles, and pin down which article an
ambiguous name refers to when you give it a little surrounding
context. One binary serves a command-line interface and a stdio
MCP server.

There is no account and no API key. Under the hood, both faces
forward each request to the hosted Edgepedia endpoint at
`https://www.edgechat.ai/mcp` and print the text it returns.
Articles carry a credit line; where the upstream text includes it,
it is shown as returned — please keep it attached wherever you
reuse the article text.

## Install

```bash
npx @reneturcios/citesearch search koala
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/citesearch
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
citesearch search Mount Fuji
citesearch fetch ep9kcz7eym
citesearch fetch ep9kcz7eym --no-citations
citesearch related ep9kcz7eym
citesearch connect epStart epTarget
citesearch resolve Jaguar --context "British car maker"

citesearch --version
```

Results print as plain text — a search returns matching articles
with their ids, titles, links and summaries; a fetch returns one
article as Markdown with its link, date, topic, license and credit
line; a resolve answer names the article meant, its confidence and
the alternatives. Exit codes: `0` on success, `1` when the upstream
request fails, `2` for usage errors. Arguments are validated before
any request is made.

Notes on `fetch`: with citations on (the default) an article's
sources appear as inline links; `--no-citations` asks for `[n]`
markers instead, which reads about a quarter shorter. The upstream
documentation also mentions fetching several ids at once, a single
section, a token budget, or only matching passages — but it does
not publish parameter names for those controls, so this client
does not invent any: `fetch` takes exactly one id and the citations
switch.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/citesearch mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "citesearch": {
      "command": "npx",
      "args": ["-y", "@reneturcios/citesearch", "mcp"]
    }
  }
}
```

### Tools

All five tools are read-only and key-free.

| Tool | Input | What it returns |
| --- | --- | --- |
| `search` | `query` (string) — a subject's name, not a question | Matching articles: id, title, link and summary (or the article opening when there is no summary). Other names and misspellings work, and topic phrases return the topic. |
| `fetch` | `id` (string); `citations` (boolean, optional) | One article as Markdown, with its link, date, topic, license and credit line. A topic's id lists its articles. `citations: false` swaps inline source links for `[n]` markers. |
| `related` | `id` (string) | Articles related to it: its topic-mates, a few from each neighbouring topic, and its geography neighbours. |
| `connect` | `from` (string), `to` (string) | The shortest chain of in-text links from one article to the other (at most 6 hops), with the sentence that makes each hop. |
| `resolve` | `name` (string); `context` (string, optional) | Which article the name means, with a confidence and the alternatives. For example, "Jaguar" beside "British car maker" is the car company; beside "big cat" it is the animal. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch only)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`. (This license covers this client; Edgepedia
article text is under its own license and carries its own credit
line.)
