/*--------------------------------------------------------------------------------------
 *  Agentic AI — detect & parse repository improvement plans in assistant text
 *--------------------------------------------------------------------------------------*/

export interface PlanChoice {
	label: string;
	sendMessage: string;
}

export interface PlanSection {
	heading: string;
	bullets: string[];
	body?: string;
}

export interface ParsedPlanProposal {
	leadIn: string;
	sections: PlanSection[];
	closingPrompt?: string;
	choices: PlanChoice[];
}

const PLAN_STRUCTURE_RE = /(?:^|\n)#{2,4}\s+|\n---\n|^\s*\d+\.\s+\*\*/m;
const CLOSING_QUESTION_RE = /would you like to (?:proceed with|begin with|start with|focus on)\s+(.+?)\??\s*$/ims;

function extractChoicesFromQuestion(question: string): PlanChoice[] {
	const raw = question
		.replace(/^would you like to (?:proceed with|begin with|start with|focus on)\s+/i, '')
		.replace(/\?\s*$/, '')
		.trim();
	if (!raw) {
		return [];
	}
	const parts = raw
		.split(/\s*,\s*or\s+|\s+or\s+|,\s+(?=[a-z])/i)
		.map(s => s.trim())
		.filter(s => s.length > 2 && s.length < 120);
	return parts.map(label => ({
		label: label.charAt(0).toUpperCase() + label.slice(1),
		sendMessage: `Focus on: ${label}. Use tools to implement this in the codebase.`,
	}));
}

function parseSections(text: string): PlanSection[] {
	const sections: PlanSection[] = [];
	const chunks = text.split(/\n(?=#{2,4}\s+)/).map(c => c.trim()).filter(Boolean);
	for (const chunk of chunks) {
		const lines = chunk.split('\n');
		const first = lines[0] ?? '';
		const heading = first.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
		if (!heading) {
			continue;
		}
		const rest = lines.slice(1);
		const bullets: string[] = [];
		const bodyLines: string[] = [];
		for (const line of rest) {
			const bullet = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*[:\s]*(.*)$/) ?? line.match(/^\s*[-*]\s+(.+)$/);
			if (bullet) {
				const label = (bullet[1] ?? '').replace(/\*\*/g, '').trim();
				const detail = (bullet[2] ?? '').trim();
				bullets.push(detail ? `${label}: ${detail}` : label);
			} else if (line.trim() && !/^---$/.test(line.trim())) {
				bodyLines.push(line.replace(/\*\*/g, '').trim());
			}
		}
		sections.push({
			heading,
			bullets,
			body: bodyLines.length ? bodyLines.join(' ') : undefined,
		});
	}
	return sections;
}

export function parsePlanProposalContent(text: string): ParsedPlanProposal | null {
	const trimmed = text.trim();
	if (trimmed.length < 100) {
		return null;
	}
	if (!PLAN_STRUCTURE_RE.test(trimmed) && !CLOSING_QUESTION_RE.test(trimmed)) {
		return null;
	}
	const closingMatch = trimmed.match(CLOSING_QUESTION_RE);
	const closingPrompt = closingMatch?.[0]?.trim();
	const beforeClosing = closingPrompt
		? trimmed.slice(0, trimmed.lastIndexOf(closingPrompt.split('\n')[0] ?? closingPrompt)).trim()
		: trimmed;

	const sections = parseSections(beforeClosing);
	let leadIn = beforeClosing;
	if (sections.length > 0) {
		const firstHeading = sections[0]!.heading;
		const idx = beforeClosing.indexOf(firstHeading);
		if (idx > 0) {
			leadIn = beforeClosing.slice(0, idx).replace(/---\s*$/m, '').trim();
		} else {
			leadIn = '';
		}
	}
	leadIn = leadIn
		.replace(/^here['']?s a summary[\s\S]*?:\s*/i, '')
		.replace(/---+/g, '')
		.trim();

	let choices = closingMatch ? extractChoicesFromQuestion(closingMatch[0]) : [];
	if (!choices.length && /improvement plan|step-by-step/i.test(trimmed)) {
		choices = [
			{ label: 'Database setup', sendMessage: 'Start with database setup and db/session.py from the plan. Use tools.' },
			{ label: 'API modularization', sendMessage: 'Start with modular API design (modules/ routers) from the plan. Use tools.' },
			{ label: 'Config & .env', sendMessage: 'Start with configuration and .env.example documentation from the plan. Use tools.' },
		];
	}

	if (sections.length < 1 && choices.length < 2 && !/\d+\.\s+/.test(trimmed)) {
		return null;
	}

	return {
		leadIn,
		sections,
		closingPrompt: closingPrompt?.replace(/\?\s*$/, '?'),
		choices,
	};
}

export function isPlanProposalContent(text: string): boolean {
	return parsePlanProposalContent(text) !== null;
}
