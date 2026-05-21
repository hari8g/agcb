/*--------------------------------------------------------------------------------------
 *  Agentic AI — parse tool calls from model output
 *--------------------------------------------------------------------------------------*/

export function extractToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
	const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
	if (!jsonMatch) {
		return null;
	}
	try {
		const parsed = JSON.parse(jsonMatch[1]);
		if (parsed?.tool_call?.name) {
			return {
				name: parsed.tool_call.name,
				arguments: parsed.tool_call.arguments ?? {},
			};
		}
	} catch { /* ignore */ }
	return null;
}
