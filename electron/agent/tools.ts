import type Anthropic from "@anthropic-ai/sdk";
import type { SearchIndex } from "../indexer";

/**
 * The tools the agent gets — a direct mapping onto electron/indexer/tools.ts,
 * plus one "terminal" tool (report_results) the agent must call to finish,
 * so the final answer is structured data instead of hoping free text parses.
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "keyword_search",
    description:
      "Search indexed file/folder names and paths for a substring match. Fast and exact — good when the user gave you a specific word, extension, or partial filename to look for.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to search for in file/folder names or paths." },
        rootPath: { type: "string", description: "Optional: restrict to files under this absolute path." },
        limit: { type: "number", description: "Max results, default 50." },
      },
      required: ["query"],
    },
  },
  {
    name: "content_search",
    description:
      "Search images and videos by what is actually shown in them, using a natural-language description (e.g. 'a white goose', 'sunset over water', 'a birthday cake'). This does NOT look at filenames — only indexed, embedded media matches. Use this whenever the user describes visual content rather than naming a file.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language description of the visual content to find." },
        rootPath: { type: "string", description: "Optional: restrict to files under this absolute path." },
        limit: { type: "number", description: "Max results, default 30." },
      },
      required: ["query"],
    },
  },
  {
    name: "metadata_search",
    description:
      "Search by structured file properties — extension/type, size range, modified date range — with no text query. Use for things like 'videos over 1GB' or 'photos modified last week'.",
    input_schema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        extensions: { type: "array", items: { type: "string" }, description: "e.g. [\"jpg\", \"mp4\"]" },
        minSize: { type: "number", description: "Bytes" },
        maxSize: { type: "number", description: "Bytes" },
        modifiedAfter: { type: "number", description: "Unix ms timestamp" },
        modifiedBefore: { type: "number", description: "Unix ms timestamp" },
        isDirectory: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "list_subdir_rollups",
    description:
      "Get a one-line summary of every immediate subfolder of a directory — file count, total size, and a breakdown of file extensions — WITHOUT opening any files. Use this to do a best-first search: check a folder's subdirectory summaries first, and only descend into (call this again on, or search within) the ones whose extension mix or size makes them plausible for what you're looking for. This is how you avoid scanning an entire large drive file-by-file.",
    input_schema: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Absolute path of the directory whose subfolders to summarize." },
      },
      required: ["dirPath"],
    },
  },
  {
    name: "get_dir_rollup",
    description: "Get the same summary as list_subdir_rollups, but for one specific directory itself rather than its children.",
    input_schema: {
      type: "object",
      properties: { dirPath: { type: "string" } },
      required: ["dirPath"],
    },
  },
  {
    name: "index_status",
    description:
      "Report what has been indexed so far: which root folders, and total file/folder counts and size. Use this to answer questions about the index itself (\"how much is indexed?\") or to check whether a location is searchable before searching it.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "report_results",
    description:
      "Call this exactly once, when you're done searching, to report your findings to the user. Always call this to finish — never just answer in plain text.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One or two sentences explaining what you found (or didn't) and how you searched." },
        files: {
          type: "array",
          description: "The matching files/folders, best match first. Empty array if nothing matched.",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              reason: { type: "string", description: "Short phrase: why this matched." },
            },
            required: ["path", "reason"],
          },
        },
      },
      required: ["summary", "files"],
    },
  },
];

export interface ToolCallSummary {
  tool: string;
  input: Record<string, unknown>;
  resultPreview: string;
}

export async function executeTool(
  index: SearchIndex,
  name: string,
  input: Record<string, unknown>
): Promise<{ result: unknown; preview: string }> {
  switch (name) {
    case "keyword_search": {
      const result = index.keywordSearch(input as { query: string; rootPath?: string; limit?: number });
      return { result, preview: `${result.length} match(es)` };
    }
    case "content_search": {
      const result = await index.vectorSearch(input as { query: string; rootPath?: string; limit?: number });
      return { result, preview: `${result.length} match(es)` };
    }
    case "metadata_search": {
      const result = index.metadataSearch(input as Parameters<SearchIndex["metadataSearch"]>[0]);
      return { result, preview: `${result.length} match(es)` };
    }
    case "list_subdir_rollups": {
      const result = index.listSubdirRollups(String(input.dirPath));
      return { result, preview: `${result.length} subfolder(s)` };
    }
    case "get_dir_rollup": {
      const result = index.getDirRollup(String(input.dirPath));
      return { result, preview: result ? "found" : "not indexed" };
    }
    case "index_status": {
      const result = index.getStats();
      return { result, preview: `${result.totalFiles.toLocaleString()} files in ${result.indexedRoots.length} root(s)` };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
