/**
 * citesearch MCP server. Tools: search, fetch, related, connect,
 * resolve.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Every call is forwarded to the hosted, key-free Edgepedia
 * endpoint (see citesearch.ts). The fetch tool's documented extra
 * controls publish no parameter names, so they are not in the
 * schema here either.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  connectArticles,
  fetchArticle,
  relatedArticles,
  resolveName,
  searchArticles,
  VERSION,
} from "./citesearch.js";
import type { FetchFn } from "./types.js";

const SearchArgs = z.object({ query: z.string() });
const FetchArgs = z.object({ id: z.string(), citations: z.boolean().optional() });
const RelatedArgs = z.object({ id: z.string() });
const ConnectArgs = z.object({ from: z.string(), to: z.string() });
const ResolveArgs = z.object({ name: z.string(), context: z.string().optional() });

const TOOLS = [
  {
    name: "search",
    description: "Search Edgepedia articles by subject.",
    inputSchema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Subject to search Edgepedia articles by." } },
      required: ["query"],
    },
  },
  {
    name: "fetch",
    description: "Read one article (or topic) in full.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Article or topic id to read in full." }, citations: { type: "boolean", description: "When true, include the article citations." } },
      required: ["id"],
    },
  },
  {
    name: "related",
    description: "Find articles related to a given article.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Article id to find related articles for." } },
      required: ["id"],
    },
  },
  {
    name: "connect",
    description: "Find the link chain between two articles.",
    inputSchema: {
      type: "object" as const,
      properties: { from: { type: "string", description: "Starting article id or name." }, to: { type: "string", description: "Target article id or name." } },
      required: ["from", "to"],
    },
  },
  {
    name: "resolve",
    description: "Disambiguate a name to the article it means.",
    inputSchema: {
      type: "object" as const,
      properties: { name: { type: "string", description: "Name to disambiguate to the article it means." }, context: { type: "string", description: "Context text helping the disambiguation." } },
      required: ["name"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "citesearch", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  try {
    let out: string;
    if (name === "search") {
      out = (await searchArticles(fetchFn, SearchArgs.parse(args ?? {}))).text;
    } else if (name === "fetch") {
      out = (await fetchArticle(fetchFn, FetchArgs.parse(args ?? {}))).text;
    } else if (name === "related") {
      out = (await relatedArticles(fetchFn, RelatedArgs.parse(args ?? {}))).text;
    } else if (name === "connect") {
      out = (await connectArticles(fetchFn, ConnectArgs.parse(args ?? {}))).text;
    } else if (name === "resolve") {
      out = (await resolveName(fetchFn, ResolveArgs.parse(args ?? {}))).text;
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
