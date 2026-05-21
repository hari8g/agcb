/*--------------------------------------------------------------------------------------
 *  Agentic AI — split streamed model output into working vs answer vs tool
 *--------------------------------------------------------------------------------------*/

export interface StreamParts {
	/** Text before a tool-call JSON block (model “thinking aloud”) */
	working: string;
	/** User-facing answer when no tool block is present */
	answer: string;
	hasToolBlock: boolean;
}

export function splitStreamContent(full: string): StreamParts {
	const fence = full.indexOf('```json');
	if (fence >= 0) {
		return {
			working: full.slice(0, fence).trim(),
			answer: '',
			hasToolBlock: true,
		};
	}
	return {
		working: '',
		answer: full,
		hasToolBlock: false,
	};
}

/** Strip tool JSON fences from text shown as the final assistant message */
export function stripToolFences(text: string): string {
	const fence = text.indexOf('```json');
	if (fence >= 0) {
		return text.slice(0, fence).trim();
	}
	return text.trim();
}
