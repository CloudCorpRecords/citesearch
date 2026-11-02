import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  connectArticles,
  extractJsonPayloads,
  fetchArticle,
  parseToolResponse,
  relatedArticles,
  resolveName,
  searchArticles,
  UPSTREAM_ENDPOINT,
} from "../src/citesearch.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

/**
 * Offline tests only: every call goes through a fake fetch that
 * records its inputs and returns a canned body. No live network,
 * no live Edgepedia claims.
 */

interface RecordedCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function response(body: string, status = 200, statusText = ""): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => null },
    text: async () => body,
  };
}

function rpcResultBody(text: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text }] },
  });
}

function fakeFetch(body: string, status = 200, statusText = "") {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    return response(body, status, statusText);
  };
  return { fetchFn, calls };
}

function sentArgs(call: RecordedCall): Record<string, unknown> {
  const parsed = JSON.parse(call.body ?? "{}") as {
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };
  assert.equal(parsed.method, "tools/call");
  return parsed.params?.arguments ?? {};
}

function sentToolName(call: RecordedCall): string {
  const parsed = JSON.parse(call.body ?? "{}") as { params?: { name?: string } };
  return parsed.params?.name ?? "";
}

describe("searchArticles", () => {
  it("forwards one JSON-RPC tools/call to the documented endpoint and returns its text", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("Koala — ep0001"));
    const out = await searchArticles(fetchFn, { query: "koala" });
    assert.equal(out.text, "Koala — ep0001");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, UPSTREAM_ENDPOINT);
    assert.equal(calls[0].url, "https://www.edgechat.ai/mcp");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].headers?.["Content-Type"], "application/json");
    assert.equal(sentToolName(calls[0]), "search");
    assert.deepEqual(sentArgs(calls[0]), { query: "koala" });
  });

  it("trims the query before forwarding", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("ok"));
    await searchArticles(fetchFn, { query: "  Marie Curie  " });
    assert.deepEqual(sentArgs(calls[0]), { query: "Marie Curie" });
  });

  it("rejects a blank query before any request is made", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("unreachable"));
    await assert.rejects(() => searchArticles(fetchFn, { query: "   " }), /query must be a non-empty string/);
    assert.equal(calls.length, 0);
  });
});

describe("fetchArticle", () => {
  it("forwards id only when citations is omitted", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("# Koala"));
    const out = await fetchArticle(fetchFn, { id: "ep9kcz7eym" });
    assert.equal(out.text, "# Koala");
    assert.equal(sentToolName(calls[0]), "fetch");
    assert.deepEqual(sentArgs(calls[0]), { id: "ep9kcz7eym" });
  });

  it("forwards citations: false verbatim when set", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("# Koala [1]"));
    await fetchArticle(fetchFn, { id: "ep9kcz7eym", citations: false });
    assert.deepEqual(sentArgs(calls[0]), { id: "ep9kcz7eym", citations: false });
  });

  it("forwards citations: true verbatim when set", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("# Koala"));
    await fetchArticle(fetchFn, { id: "ep9kcz7eym", citations: true });
    assert.deepEqual(sentArgs(calls[0]), { id: "ep9kcz7eym", citations: true });
  });

  it("rejects a blank id before any request is made", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("unreachable"));
    await assert.rejects(() => fetchArticle(fetchFn, { id: "" }), /id must be a non-empty string/);
    assert.equal(calls.length, 0);
  });
});

describe("relatedArticles", () => {
  it("forwards the id to the related tool", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("related list"));
    const out = await relatedArticles(fetchFn, { id: "ep0002" });
    assert.equal(out.text, "related list");
    assert.equal(sentToolName(calls[0]), "related");
    assert.deepEqual(sentArgs(calls[0]), { id: "ep0002" });
  });

  it("rejects a blank id before any request is made", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("unreachable"));
    await assert.rejects(() => relatedArticles(fetchFn, { id: " " }), /id must be a non-empty string/);
    assert.equal(calls.length, 0);
  });
});

describe("connectArticles", () => {
  it("forwards both ends of the chain", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("chain of 3 hops"));
    const out = await connectArticles(fetchFn, { from: "epA", to: "epB" });
    assert.equal(out.text, "chain of 3 hops");
    assert.equal(sentToolName(calls[0]), "connect");
    assert.deepEqual(sentArgs(calls[0]), { from: "epA", to: "epB" });
  });

  it("rejects a blank target before any request is made", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("unreachable"));
    await assert.rejects(
      () => connectArticles(fetchFn, { from: "epA", to: "" }),
      /to must be a non-empty string/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("resolveName", () => {
  it("forwards name and context when context is given", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("Jaguar Land Rover (confidence high)"));
    const out = await resolveName(fetchFn, { name: "Jaguar", context: "British car maker" });
    assert.equal(out.text, "Jaguar Land Rover (confidence high)");
    assert.equal(sentToolName(calls[0]), "resolve");
    assert.deepEqual(sentArgs(calls[0]), { name: "Jaguar", context: "British car maker" });
  });

  it("omits context when it is absent or blank", async () => {
    const a = fakeFetch(rpcResultBody("the animal"));
    await resolveName(a.fetchFn, { name: "Jaguar" });
    assert.deepEqual(sentArgs(a.calls[0]), { name: "Jaguar" });
    const b = fakeFetch(rpcResultBody("the animal"));
    await resolveName(b.fetchFn, { name: "Jaguar", context: "   " });
    assert.deepEqual(sentArgs(b.calls[0]), { name: "Jaguar" });
  });

  it("rejects a blank name before any request is made", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("unreachable"));
    await assert.rejects(() => resolveName(fetchFn, { name: "" }), /name must be a non-empty string/);
    assert.equal(calls.length, 0);
  });
});

describe("response parsing", () => {
  it("parses a text/event-stream body and joins multiple text blocks", async () => {
    const sse =
      "event: message\n" +
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "line one" }, { type: "text", text: "line two" }] } })}\n\n`;
    const { fetchFn } = fakeFetch(sse);
    const out = await searchArticles(fetchFn, { query: "koala" });
    assert.equal(out.text, "line one\nline two");
  });

  it("extractJsonPayloads handles plain JSON and SSE, ignoring noise", () => {
    assert.equal(extractJsonPayloads('{"a":1}').length, 1);
    assert.equal(extractJsonPayloads("").length, 0);
    const sse = ": keep-alive\ndata: {\"a\":1}\n\ndata: [DONE]\n";
    assert.deepEqual(extractJsonPayloads(sse), [{ a: 1 }]);
  });

  it("raises on a JSON-RPC error payload, carrying its message", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "unknown article id" },
    });
    const { fetchFn } = fakeFetch(body);
    await assert.rejects(
      () => relatedArticles(fetchFn, { id: "epNope" }),
      /Edgepedia upstream error: unknown article id/,
    );
  });

  it("raises on an isError result, carrying its text", () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { isError: true, content: [{ type: "text", text: "no such article" }] },
    });
    assert.throws(() => parseToolResponse(body), /error result: no such article/);
  });

  it("raises on an empty or non-JSON body", () => {
    assert.throws(() => parseToolResponse(""), /empty or non-JSON/);
    assert.throws(() => parseToolResponse("<html>oops</html>"), /empty or non-JSON/);
  });

  it("raises on an HTTP error, naming the status", async () => {
    const { fetchFn } = fakeFetch("slow down", 429, "Too Many Requests");
    await assert.rejects(
      () => searchArticles(fetchFn, { query: "koala" }),
      /HTTP 429 Too Many Requests: slow down/,
    );
  });

  it("raises a reachability error when the fetch itself fails", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("socket hang up");
    };
    await assert.rejects(
      () => searchArticles(fetchFn, { query: "koala" }),
      /Failed to reach Edgepedia upstream at https:\/\/www\.edgechat\.ai\/mcp: socket hang up/,
    );
  });

  it("honours an endpoint override", async () => {
    const { fetchFn, calls } = fakeFetch(rpcResultBody("ok"));
    await searchArticles(fetchFn, { query: "koala" }, { endpoint: "https://example.invalid/mcp" });
    assert.equal(calls[0].url, "https://example.invalid/mcp");
  });
});
