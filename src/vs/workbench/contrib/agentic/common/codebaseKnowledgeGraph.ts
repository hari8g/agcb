/*--------------------------------------------------------------------------------------
 *  Agentic AI — temporal codebase knowledge graph (compact architecture context)
 *--------------------------------------------------------------------------------------*/

export interface KnowledgeGraphNode {
	id: string;
	kind: 'workspace' | 'package' | 'directory' | 'file';
	label: string;
	path?: string;
	role?: string;
}

export interface KnowledgeGraphEdge {
	from: string;
	to: string;
	kind: 'contains' | 'imports' | 'related';
}

export interface TemporalKnowledgeGraph {
	workspaceKey: string;
	generatedAt: number;
	ttlMs: number;
	nodes: KnowledgeGraphNode[];
	edges: KnowledgeGraphEdge[];
	/** One-line summaries per top-level area */
	areas: string[];
	/** Paths most relevant to the current user message */
	queryRelevantPaths: { path: string; score: number; hint: string }[];
}

export const DEFAULT_KG_TTL_MS = 60 * 60 * 1000;

const IMPORT_RE = /(?:import|from|require)\s*\(?['"]([^'"]+)['"]/g;

export function extractImportTargets(source: string, max = 12): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	let m: RegExpExecArray | null;
	while ((m = IMPORT_RE.exec(source)) !== null && out.length < max) {
		const t = m[1].trim();
		if (!t.startsWith('.') && !t.startsWith('/')) {
			continue;
		}
		if (!seen.has(t)) {
			seen.add(t);
			out.push(t);
		}
	}
	return out;
}

export function inferFileRole(path: string): string {
	const base = path.split(/[/\\]/).pop() ?? path;
	if (/\.test\.|\.spec\.|__tests__|test\//i.test(path)) {
		return 'test';
	}
	if (/service|Service/.test(base)) {
		return 'service';
	}
	if (/contribution|Contribution/.test(base)) {
		return 'registration';
	}
	if (/types?\.ts$/i.test(base)) {
		return 'types';
	}
	if (/react|tsx|jsx/i.test(path)) {
		return 'ui';
	}
	if (/electron-main|runtime/i.test(path)) {
		return 'runtime';
	}
	return 'module';
}

export function buildWorkspaceKey(folderUris: string[]): string {
	return folderUris.slice().sort().join('|');
}

export function isKnowledgeGraphFresh(kg: TemporalKnowledgeGraph, now = Date.now()): boolean {
	return now - kg.generatedAt < kg.ttlMs;
}

/** Compact prompt block — target well under typical context budgets. */
export function serializeKnowledgeGraphForPrompt(kg: TemporalKnowledgeGraph, maxChars = 2800): string {
	const lines: string[] = [
		'<architecture_graph>',
		`generated=${new Date(kg.generatedAt).toISOString()} relevant_paths=${kg.queryRelevantPaths.length}`,
		'',
		'## Repository areas',
		...kg.areas.slice(0, 14).map(a => `- ${a}`),
	];

	if (kg.queryRelevantPaths.length) {
		lines.push('', '## Relevant to this task');
		for (const r of kg.queryRelevantPaths.slice(0, 10)) {
			lines.push(`- \`${r.path}\` (${r.hint}, score ${r.score.toFixed(2)})`);
		}
	}

	const moduleNodes = kg.nodes.filter(n => n.kind === 'directory' || n.kind === 'package').slice(0, 12);
	if (moduleNodes.length) {
		lines.push('', '## Modules');
		for (const n of moduleNodes) {
			lines.push(`- ${n.label}${n.role ? ` — ${n.role}` : ''}`);
		}
	}

	const importEdges = kg.edges.filter(e => e.kind === 'imports').slice(0, 10);
	if (importEdges.length) {
		lines.push('', '## Import relationships (sample)');
		for (const e of importEdges) {
			lines.push(`- ${e.from} → ${e.to}`);
		}
	}

	lines.push('', 'Use this map before reading large files. Prefer targeted read_file/grep on listed paths.', '</architecture_graph>');

	let text = lines.join('\n');
	if (text.length > maxChars) {
		text = `${text.slice(0, maxChars - 20)}\n…</architecture_graph>`;
	}
	return text;
}
