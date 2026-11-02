#!/usr/bin/env node
/**
 * citesearch CLI.
 *
 *   citesearch search <query...>
 *   citesearch fetch <id> [--citations | --no-citations]
 *   citesearch related <id>
 *   citesearch connect <from> <to>
 *   citesearch resolve <name...> [--context <words>]
 *   citesearch mcp
 *
 * Every command forwards one call to the hosted, key-free Edgepedia
 * endpoint and prints the returned text. Argument validation runs
 * before any request is made.
 * Exit codes: 0 success, 1 upstream/request error, 2 usage error.
 */
import {
  connectArticles,
  fetchArticle,
  relatedArticles,
  resolveName,
  searchArticles,
  VERSION,
} from "./citesearch.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  citesearch search <query...>
  citesearch fetch <id> [--citations | --no-citations]
  citesearch related <id>
  citesearch connect <from> <to>
  citesearch resolve <name...> [--context <words>]
  citesearch mcp
  citesearch --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function withoutFlags(args: string[], valueFlags: string[], boolFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else if (!boolFlags.includes(args[i])) out.push(args[i]);
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const known = ["search", "fetch", "related", "connect", "resolve"];
  if (!known.includes(cmd)) usage();

  const fetchFn = globalThis.fetch as unknown as FetchFn;
  try {
    let text: string;
    if (cmd === "search") {
      const query = withoutFlags(rest, [], []).join(" ").trim();
      if (!query) usage();
      text = (await searchArticles(fetchFn, { query })).text;
    } else if (cmd === "fetch") {
      if (rest.includes("--citations") && rest.includes("--no-citations")) usage();
      if (rest.includes("--context")) usage();
      const [id] = withoutFlags(rest, [], ["--citations", "--no-citations"]);
      if (!id) usage();
      const positional = withoutFlags(rest, [], ["--citations", "--no-citations"]);
      if (positional.length !== 1) usage();
      const citations = rest.includes("--no-citations")
        ? false
        : rest.includes("--citations")
          ? true
          : undefined;
      text = (await fetchArticle(fetchFn, { id, citations })).text;
    } else if (cmd === "related") {
      const positional = withoutFlags(rest, [], []);
      if (positional.length !== 1) usage();
      text = (await relatedArticles(fetchFn, { id: positional[0] })).text;
    } else if (cmd === "connect") {
      const positional = withoutFlags(rest, [], []);
      if (positional.length !== 2) usage();
      text = (await connectArticles(fetchFn, { from: positional[0], to: positional[1] })).text;
    } else {
      // resolve
      if (rest.includes("--context") && flagValue(rest, "--context") === undefined) usage();
      const name = withoutFlags(rest, ["--context"], []).join(" ").trim();
      if (!name) usage();
      text = (await resolveName(fetchFn, { name, context: flagValue(rest, "--context") })).text;
    }
    console.log(text);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
