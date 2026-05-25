/*--------------------------------------------------------------------------------------
 *  Agentic AI — parse tool calls from model output
 *--------------------------------------------------------------------------------------*/

export type ParsedToolCall = { name: string; arguments: Record<string, unknown> };

function parseToolCallFromFence(inner: string): ParsedToolCall | null {
	try {
		const parsed = JSON.parse(inner);
		if (parsed?.tool_call?.name) {
			return {
				name: parsed.tool_call.name,
				arguments: parsed.tool_call.arguments ?? {},
			};
		}
	} catch { /* ignore */ }
	return null;
}

export function extractAllToolCalls(text: string): ParsedToolCall[] {
	const results: ParsedToolCall[] = [];
	const re = /```json\s*([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		const tc = parseToolCallFromFence(match[1]);
		if (tc) {
			results.push(tc);
		}
	}
	return results;
}

export function extractToolCall(text: string): ParsedToolCall | null {
	const all = extractAllToolCalls(text);
	if (all.length > 0) {
		return all[0];
	}
	const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
	if (!jsonMatch) {
		return null;
	}
	return parseToolCallFromFence(jsonMatch[1]);
}
