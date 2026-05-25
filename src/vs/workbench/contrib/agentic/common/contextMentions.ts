/*--------------------------------------------------------------------------------------
 *  Agentic AI — @ file/symbol context mentions (Cursor-style)
 *--------------------------------------------------------------------------------------*/

const MENTION_RE = /@([\w./\\-]+(?:\.[\w]+)?)/g;

export interface ParsedContextMention {
	raw: string;
	path: string;
}

export function parseContextMentions(text: string): ParsedContextMention[] {
	const out: ParsedContextMention[] = [];
	const seen = new Set<string>();
	let m: RegExpExecArray | null;
	while ((m = MENTION_RE.exec(text)) !== null) {
		const path = m[1].trim();
		if (!path || seen.has(path)) {
			continue;
		}
		seen.add(path);
		out.push({ raw: m[0], path });
	}
	return out;
}

export function stripContextMentionsForDisplay(text: string): string {
	return text.replace(MENTION_RE, (_, p) => `@${p}`);
}

export function buildMentionsContextBlock(mentions: { path: string; snippet?: string; error?: string }[]): string {
	if (!mentions.length) {
		return '';
	}
	const lines = ['<user_attached_context>', 'The user explicitly attached these paths with @mentions:'];
	for (const m of mentions) {
		if (m.error) {
			lines.push(`- @${m.path}: ${m.error}`);
		} else if (m.snippet) {
			lines.push(`- @${m.path}:`, '```', m.snippet.slice(0, 6000), '```');
		} else {
			lines.push(`- @${m.path} (read this file with read_file if needed)`);
		}
	}
	lines.push('</user_attached_context>');
	return lines.join('\n');
}
