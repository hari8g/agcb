/*--------------------------------------------------------------------------------------
 *  Agentic AI — session memory merge, extraction, and prompt blocks
 *--------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import type { MemoryFact, MemoryFactKind, ProjectModel, RunMemoryInput, UserSessionMemory } from './sessionMemoryTypes.js';

const MAX_PROJECT_FACTS = 28;
const MAX_USER_FACTS = 18;

export function createMemoryFact(
	kind: MemoryFactKind,
	text: string,
	source: MemoryFact['source'],
	weight = 1,
): MemoryFact {
	return {
		id: generateUuid(),
		kind,
		text: text.trim().slice(0, 400),
		weight,
		updatedAt: Date.now(),
		source,
	};
}

export function extractExplicitUserMemory(userMessage: string): MemoryFact[] {
	const facts: MemoryFact[] = [];
	const text = userMessage.trim();
	if (!text) {
		return facts;
	}

	const remember = text.match(/^\s*remember\s*[:,-]?\s*(.+)$/i);
	if (remember?.[1]) {
		facts.push(createMemoryFact('user_preference', remember[1], 'user', 2));
	}

	const always = [...text.matchAll(/\balways\s+([^.!?\n]{4,120})/gi)];
	for (const m of always.slice(0, 2)) {
		facts.push(createMemoryFact('user_preference', `Always: ${m[1]!.trim()}`, 'user', 1.5));
	}

	const prefer = [...text.matchAll(/\bprefer\s+([^.!?\n]{4,120})/gi)];
	for (const m of prefer.slice(0, 2)) {
		facts.push(createMemoryFact('user_preference', `Prefer: ${m[1]!.trim()}`, 'user', 1.5));
	}

	const never = [...text.matchAll(/\b(?:never|don'?t)\s+([^.!?\n]{4,120})/gi)];
	for (const m of never.slice(0, 1)) {
		facts.push(createMemoryFact('user_preference', `Avoid: ${m[1]!.trim()}`, 'user', 1.5));
	}

	if (/\buse\s+pnpm\b/i.test(text)) {
		facts.push(createMemoryFact('user_preference', 'Use pnpm for package commands', 'user', 1.2));
	} else if (/\buse\s+yarn\b/i.test(text)) {
		facts.push(createMemoryFact('user_preference', 'Use yarn for package commands', 'user', 1.2));
	} else if (/\buse\s+npm\b/i.test(text)) {
		facts.push(createMemoryFact('user_preference', 'Use npm for package commands', 'user', 1.2));
	}

	return dedupeFacts(facts);
}

export function inferMemoryFromRun(input: RunMemoryInput): MemoryFact[] {
	const facts: MemoryFact[] = [];
	const msg = input.userMessage.trim();

	if (input.intent === 'create_file' && input.targetPaths?.length) {
		for (const p of input.targetPaths.slice(0, 4)) {
			facts.push(createMemoryFact('target_hint', `Recent create/edit target: ${p}`, 'inferred', 0.8));
		}
	} else if (input.targetPaths?.length) {
		for (const p of input.targetPaths.slice(0, 3)) {
			facts.push(createMemoryFact('target_hint', `Frequent target path: ${p}`, 'inferred', 0.6));
		}
	}

	if (input.successfulEditPaths?.length) {
		for (const p of input.successfulEditPaths.slice(0, 4)) {
			facts.push(createMemoryFact('workflow', `Successfully edited: ${p}`, 'inferred', 0.5));
		}
	}

	if (/\bmonorepo\b/i.test(msg)) {
		facts.push(createMemoryFact('project_convention', 'User works in a monorepo layout', 'inferred', 0.7));
	}

	const tools = new Set(input.toolNames ?? []);
	if (tools.has('run_terminal_command')) {
		facts.push(createMemoryFact('workflow', 'User expects terminal commands for verify/build', 'inferred', 0.4));
	}

	return dedupeFacts(facts);
}

export interface ProjectScanHints {
	packageName?: string;
	packageManager?: string;
	hasTypeScript?: boolean;
	hasTests?: boolean;
	testScript?: string;
	monorepo?: boolean;
}

export function factsFromProjectScan(hints: ProjectScanHints): MemoryFact[] {
	const facts: MemoryFact[] = [];
	if (hints.packageName) {
		facts.push(createMemoryFact('stack', `Project package name: ${hints.packageName}`, 'project_scan', 1));
	}
	if (hints.packageManager) {
		facts.push(createMemoryFact('stack', `Package manager: ${hints.packageManager}`, 'project_scan', 1.2));
	}
	if (hints.hasTypeScript) {
		facts.push(createMemoryFact('stack', 'TypeScript project (tsconfig present)', 'project_scan', 0.9));
	}
	if (hints.testScript) {
		facts.push(createMemoryFact('project_convention', `Test script: ${hints.testScript}`, 'project_scan', 0.8));
	} else if (hints.hasTests) {
		facts.push(createMemoryFact('project_convention', 'Test files present in workspace', 'project_scan', 0.6));
	}
	if (hints.monorepo) {
		facts.push(createMemoryFact('project_convention', 'Monorepo workspace (multi-package)', 'project_scan', 1));
	}
	return facts;
}

export function mergeFacts(existing: MemoryFact[], incoming: MemoryFact[], max: number): MemoryFact[] {
	const byKey = new Map<string, MemoryFact>();
	for (const f of existing) {
		byKey.set(normalizeFactKey(f), f);
	}
	for (const f of incoming) {
		const key = normalizeFactKey(f);
		const prev = byKey.get(key);
		if (prev) {
			byKey.set(key, {
				...prev,
				text: f.text,
				weight: Math.max(prev.weight, f.weight),
				updatedAt: Date.now(),
				source: f.source === 'user' ? 'user' : prev.source,
			});
		} else {
			byKey.set(key, f);
		}
	}
	return [...byKey.values()]
		.sort((a, b) => b.weight - a.weight || b.updatedAt - a.updatedAt)
		.slice(0, max);
}

function normalizeFactKey(f: MemoryFact): string {
	return `${f.kind}:${f.text.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function dedupeFacts(facts: MemoryFact[]): MemoryFact[] {
	return mergeFacts([], facts, MAX_USER_FACTS + MAX_PROJECT_FACTS);
}

export function buildSessionMemoryPromptBlock(
	project: ProjectModel,
	user: UserSessionMemory,
): string {
	const projectFacts = project.facts.slice(0, 16);
	const userFacts = user.facts.slice(0, 12);
	if (!projectFacts.length && !userFacts.length && !project.tags.length) {
		return '';
	}

	const lines: string[] = ['<session_memory>', 'Persistent memory for this workspace — respect unless the user overrides in this message:'];

	if (project.tags.length) {
		lines.push('', `Project tags: ${project.tags.join(', ')}`);
	}
	if (projectFacts.length) {
		lines.push('', '## Project model');
		for (const f of projectFacts) {
			lines.push(`- (${f.kind}) ${f.text}`);
		}
	}
	if (userFacts.length) {
		lines.push('', '## User preferences (this workspace)');
		for (const f of userFacts) {
			lines.push(`- ${f.text}`);
		}
	}

	lines.push(
		'',
		'When the user says "remember …" or states a lasting preference, follow it in this and future runs.',
		'</session_memory>',
	);

	let text = lines.join('\n');
	if (text.length > 4200) {
		text = `${text.slice(0, 4180)}\n…</session_memory>`;
	}
	return text;
}

export function emptyProjectModel(workspaceKey: string): ProjectModel {
	return { workspaceKey, facts: [], tags: [], updatedAt: Date.now() };
}

export function emptyUserMemory(workspaceKey: string): UserSessionMemory {
	return { workspaceKey, facts: [], updatedAt: Date.now() };
}

export function partitionIncomingFacts(facts: MemoryFact[]): { project: MemoryFact[]; user: MemoryFact[] } {
	const project: MemoryFact[] = [];
	const user: MemoryFact[] = [];
	for (const f of facts) {
		if (f.kind === 'user_preference') {
			user.push(f);
		} else {
			project.push(f);
		}
	}
	return { project, user };
}

export { MAX_PROJECT_FACTS, MAX_USER_FACTS };
