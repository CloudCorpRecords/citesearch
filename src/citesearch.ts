/**
 * citesearch core: a client for the hosted Edgepedia encyclopedia.
 *
 *   search    search articles by subject
 *   fetch     read one article (or topic) in full
 *   related   find articles related to a given article
 *   connect   find the link chain between two articles
 *   resolve   disambiguate a name to the article it means
 *
 * Upstream contract (as documented in the public spec): the hosted
 * server lives at https://www.edgechat.ai/mcp and speaks MCP over
 * Streamable HTTP. Access is read-only and key-free — no credential
 * is read, required, or sent. Each local operation becomes one
 * JSON-RPC 2.0 `tools/call` POST to that endpoint with the tool name
 * and the documented arguments. A Streamable HTTP endpoint may
 * answer with a plain JSON document or with a text/event-stream
 * (SSE) body whose `data:` lines carry JSON-RPC response objects;
 * both shapes are parsed here.
 *
 * Reconstruction notes (labelled as such):
 * - The spec documents the endpoint and the tool/argument surface
 *   but does not print a wire example, so the JSON-RPC framing
 *   above follows the standard MCP Streamable HTTP contract for a
 *   `tools/call` request.
 * - Result handling: the text blocks of the upstream result's
 *   `content` array are joined with newlines and returned verbatim.
 *   An upstream result flagged `isError` is raised as an error
 *   carrying its text. No article data is invented locally.
 * - The documented extra fetch controls (multiple ids, a section, a
 *   token budget, passage matching) publish no parameter names, so
 *   they are not forwarded — only `id` and `citations` are.
 *
 * All HTTP goes through an injected FetchFn, so the wire handling is
 * fully testable offline. Argument validation runs before any
 * request is made: a blank required string fails locally and no
 * fetch is issued.
 */
import type {
  CallOptions,
  ConnectArgs,
  FetchArgs,
  FetchFn,
  RelatedArgs,
  RemoteResult,
  ResolveArgs,
  SearchArgs,
} from "./types.js";

export const VERSION = "0.1.0";

export const UPSTREAM_ENDPOINT = "https://www.edgechat.ai/mcp";

export const USER_AGENT =
  "citesearch/0.1.0 (MCP server; +https://github.com/CloudCorpRecords/citesearch)";

function requireNonEmpty(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${field} must be a non-empty string`);
  return text;
}

/**
 * Pull the JSON payloads out of an upstream response body: either the
 * whole body is one JSON document, or it is an SSE stream whose
 * `data:` lines each carry one. Non-JSON stream noise is ignored.
 */
export function extractJsonPayloads(body: string): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const dataLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");
  const candidates = dataLines.length > 0 ? dataLines : [trimmed];
  const payloads: unknown[] = [];
  for (const candidate of candidates) {
    try {
      payloads.push(JSON.parse(candidate));
    } catch {
      // Comments and keep-alives in a stream are not payloads.
    }
  }
  return payloads;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the result text out of one JSON-RPC response payload, or throw on an error payload. */
export function resultTextFromPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error("Edgepedia upstream returned an unexpected response shape");
  }
  if (payload.error !== undefined && payload.error !== null) {
    const err = payload.error;
    const message =
      isRecord(err) && typeof err.message === "string"
        ? err.message
        : JSON.stringify(err);
    throw new Error(`Edgepedia upstream error: ${message}`);
  }
  const result = payload.result;
  if (typeof result === "string") return result;
  if (isRecord(result)) {
    if (Array.isArray(result.content)) {
      const texts = result.content
        .filter(isRecord)
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string);
      if (texts.length > 0) {
        if (result.isError === true) {
          throw new Error(`Edgepedia upstream returned an error result: ${texts.join("\n")}`);
        }
        return texts.join("\n");
      }
      throw new Error("Edgepedia upstream returned an empty content list");
    }
    if (typeof result.text === "string") return result.text;
  }
  throw new Error("Edgepedia upstream returned a response with no readable result text");
}

/** Parse an upstream response body (plain JSON or SSE) into result text. */
export function parseToolResponse(body: string): string {
  const payloads = extractJsonPayloads(body);
  if (payloads.length === 0) {
    throw new Error("Edgepedia upstream returned an empty or non-JSON response");
  }
  // A stream may carry notifications before the response; the last
  // payload carrying a result or an error is the response.
  for (let i = payloads.length - 1; i >= 0; i--) {
    const payload = payloads[i];
    if (isRecord(payload) && (payload.result !== undefined || payload.error !== undefined)) {
      return resultTextFromPayload(payload);
    }
  }
  return resultTextFromPayload(payloads[payloads.length - 1]);
}

let nextRequestId = 1;

/** Forward one tool call to the hosted Edgepedia endpoint and return its result text. */
export async function callUpstreamTool(
  fetchFn: FetchFn,
  toolName: string,
  args: Record<string, unknown>,
  options: CallOptions = {},
): Promise<string> {
  const endpoint = options.endpoint ?? UPSTREAM_ENDPOINT;
  const requestBody = JSON.stringify({
    jsonrpc: "2.0",
    id: nextRequestId++,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  let response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": USER_AGENT,
      },
      body: requestBody,
    });
  } catch (err) {
    throw new Error(
      `Failed to reach Edgepedia upstream at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const body = await response.text();
  if (!response.ok) {
    const detail = body.trim().slice(0, 200);
    throw new Error(
      `Edgepedia upstream request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }
  return parseToolResponse(body);
}

/** Search Edgepedia articles by subject. */
export async function searchArticles(
  fetchFn: FetchFn,
  args: SearchArgs,
  options: CallOptions = {},
): Promise<RemoteResult> {
  const query = requireNonEmpty(args?.query, "query");
  const text = await callUpstreamTool(fetchFn, "search", { query }, options);
  return { text };
}

/** Read one article (or topic) in full. */
export async function fetchArticle(
  fetchFn: FetchFn,
  args: FetchArgs,
  options: CallOptions = {},
): Promise<RemoteResult> {
  const id = requireNonEmpty(args?.id, "id");
  const forwarded: Record<string, unknown> = { id };
  if (typeof args.citations === "boolean") forwarded.citations = args.citations;
  const text = await callUpstreamTool(fetchFn, "fetch", forwarded, options);
  return { text };
}

/** Find articles related to a given article. */
export async function relatedArticles(
  fetchFn: FetchFn,
  args: RelatedArgs,
  options: CallOptions = {},
): Promise<RemoteResult> {
  const id = requireNonEmpty(args?.id, "id");
  const text = await callUpstreamTool(fetchFn, "related", { id }, options);
  return { text };
}

/** Find the link chain between two articles (at most 6 hops upstream). */
export async function connectArticles(
  fetchFn: FetchFn,
  args: ConnectArgs,
  options: CallOptions = {},
): Promise<RemoteResult> {
  const from = requireNonEmpty(args?.from, "from");
  const to = requireNonEmpty(args?.to, "to");
  const text = await callUpstreamTool(fetchFn, "connect", { from, to }, options);
  return { text };
}

/** Disambiguate a name to the article it means. */
export async function resolveName(
  fetchFn: FetchFn,
  args: ResolveArgs,
  options: CallOptions = {},
): Promise<RemoteResult> {
  const name = requireNonEmpty(args?.name, "name");
  const forwarded: Record<string, unknown> = { name };
  if (typeof args.context === "string" && args.context.trim()) {
    forwarded.context = args.context.trim();
  }
  const text = await callUpstreamTool(fetchFn, "resolve", forwarded, options);
  return { text };
}

/** Render a payload as the text block MCP clients and the CLI show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
