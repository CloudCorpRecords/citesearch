/**
 * citesearch types.
 *
 * The five operations mirror the documented Edgepedia tool surface:
 * search the corpus by subject, fetch one article or topic in full,
 * list related articles, find the link chain between two articles,
 * and resolve an ambiguous name to the article it means. Every
 * operation is forwarded to the hosted Edgepedia MCP endpoint, so
 * the results are whatever text that endpoint returns. HTTP access
 * is described by a minimal response surface so tests can inject a
 * fake fetch and never touch the network.
 */

/** Arguments for `search`: a subject's name, not a question. */
export interface SearchArgs {
  query: string;
}

/** Arguments for `fetch`: one article or topic id, plus the optional citations switch. */
export interface FetchArgs {
  id: string;
  /**
   * Optional. When false, inline source links are swapped for [n]
   * markers. When omitted, nothing is sent for this field and the
   * upstream default (inline source links) applies.
   */
  citations?: boolean;
}

/** Arguments for `related`: the article whose neighbours are wanted. */
export interface RelatedArgs {
  id: string;
}

/** Arguments for `connect`: the two ends of the link chain. */
export interface ConnectArgs {
  from: string;
  to: string;
}

/** Arguments for `resolve`: a name, plus optional surrounding words as context. */
export interface ResolveArgs {
  name: string;
  context?: string;
}

/** One forwarded call's outcome: the upstream result text, verbatim. */
export interface RemoteResult {
  text: string;
}

/** Options accepted by the forwarding core. */
export interface CallOptions {
  /** Upstream MCP endpoint override; defaults to the documented hosted endpoint. */
  endpoint?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
