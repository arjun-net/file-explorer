import Anthropic from "@anthropic-ai/sdk";
import type { SearchIndex } from "../indexer";
import type { AgentStep } from "../../shared/types";
import { AGENT_TOOLS, executeTool } from "./tools";

export type { AgentStep };

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;
const MAX_TOOL_RESULT_CHARS = 8000;

function buildSystemPrompt(currentPath: string, indexedRoots: string[]): string {
  return `You are a search agent inside a desktop file explorer. The user is currently browsing "${currentPath}".
Indexed (searchable) locations: ${indexedRoots.length ? indexedRoots.join(", ") : "none yet — nothing has been indexed"}.

Use the available tools to find files matching what the user describes:
- content_search for anything visual — what's actually shown in a photo or video, not its name.
- keyword_search for names, partial filenames, or extensions.
- metadata_search for size, type, or date-range constraints with no text query.
- list_subdir_rollups / get_dir_rollup to check what a folder contains (file counts, size, extension mix) before searching inside it or its subfolders — prefer this over searching an entire large drive at once. Use it to do a best-first search: check rollups, decide which subfolders are plausible, and only look further into those.

- index_status to report what's indexed (roots, file counts, total size) — use it for questions about the index itself.

If nothing is indexed yet (tell the user to open Indexed Search and click "Index This Folder" on the folder they care about — you cannot index folders yourself), or none of the indexed locations plausibly cover what the user described, say so plainly in your summary rather than guessing or inventing results.

You MUST finish by calling report_results exactly once — never answer in plain text alone.`;
}

export async function runAgent(
  apiKey: string,
  query: string,
  currentPath: string,
  index: SearchIndex,
  onStep: (step: AgentStep) => void
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const stats = index.getStats();

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: query }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: buildSystemPrompt(currentPath, stats.indexedRoots),
        tools: AGENT_TOOLS,
        messages,
      });
    } catch (err) {
      onStep({ type: "error", error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    for (const t of textBlocks) {
      if (t.text.trim()) onStep({ type: "text", text: t.text });
    }

    const reportCall = toolUseBlocks.find((b) => b.name === "report_results");
    if (reportCall) {
      const input = reportCall.input as { summary: string; files: { path: string; reason: string }[] };
      onStep({ type: "done", summary: input.summary, files: input.files ?? [] });
      return;
    }

    if (toolUseBlocks.length === 0) {
      const text = textBlocks
        .map((b) => b.text)
        .join("\n")
        .trim();
      onStep({ type: "done", summary: text || "No results.", files: [] });
      return;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUseBlocks) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      onStep({ type: "tool_call", tool: call.name, input });
      try {
        const { result, preview } = await executeTool(index, call.name, input);
        onStep({ type: "tool_result", tool: call.name, preview });
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onStep({ type: "tool_result", tool: call.name, preview: `error: ${message}` });
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Error: ${message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  onStep({ type: "error", error: "Search took too many steps without finishing." });
}
