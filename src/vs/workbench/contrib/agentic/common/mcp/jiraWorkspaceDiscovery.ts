/*--------------------------------------------------------------------------------------
 *  JIRA workflow — map ticket text → relevant workspace paths
 *--------------------------------------------------------------------------------------*/

import type { JiraTicket } from './jiraWorkflowTypes.js';

const DOMAIN_TERMS: { re: RegExp; terms: string[] }[] = [
	{ re: /\bseller\b|\bvendor\b|\bmerchant\b/i, terms: ['seller', 'vendor', 'merchant', 'onboard'] },
	{ re: /\bonboard/i, terms: ['onboard', 'registration', 'signup', 'seller'] },
	{ re: /\badmin\b|\breview queue\b/i, terms: ['admin', 'review', 'approval'] },
	{ re: /\bauth\b|\blogin\b|\baccount\b/i, terms: ['auth', 'login', 'user', 'account'] },
	{ re: /\bpayout\b|\bbank\b/i, terms: ['payout', 'bank', 'payment'] },
	{ re: /\bfrontend\b|\bui\b|\bscreen\b/i, terms: ['frontend', 'components', 'pages', 'views'] },
	{ re: /\bbackend\b|\bapi\b|\bendpoint\b/i, terms: ['backend', 'api', 'routes', 'controller', 'service'] },
	{ re: /\btest\b|\bjest\b|\bpytest\b/i, terms: ['test', 'spec', '__tests__'] },
	{ re: /\bmodel\b|\bschema\b|\bmigration\b/i, terms: ['model', 'schema', 'entity', 'migration'] },
	{ re: /\bvalidat/i, terms: ['valid', 'schema', 'dto'] },
	{ re: /\bdocument\b|\bupload\b/i, terms: ['document', 'upload', 'file'] },
];

const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|py|go|java|vue|cs|rb)$/i;
const CONFIG_FILE_RE = /package\.json$|tsconfig.*\.json$|pyproject\.toml$|requirements\.txt$/i;
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|out|dist|\.build|coverage|__pycache__)(\/|$)/i;

export function extractTicketSearchTerms(ticket: JiraTicket): string[] {
	const hay = `${ticket.summary ?? ''} ${ticket.description ?? ''}`.toLowerCase();
	const terms = new Set<string>();
	for (const { re, terms: list } of DOMAIN_TERMS) {
		if (re.test(hay)) {
			for (const t of list) {
				terms.add(t);
			}
		}
	}
	const words = hay.match(/\b[a-z][a-z0-9_]{3,}\b/g) ?? [];
	for (const w of words) {
		if (!/^(the|and|with|that|this|from|should|will|must|have|been|into|after|before)$/.test(w)) {
			terms.add(w);
		}
	}
	return [...terms].slice(0, 24);
}

export function scorePathForTicket(relPath: string, terms: string[]): number {
	const p = relPath.replace(/\\/g, '/').toLowerCase();
	if (SKIP_DIR_RE.test(p)) {
		return 0;
	}
	let score = 0;
	if (SOURCE_FILE_RE.test(p)) {
		score += 2;
	}
	if (CONFIG_FILE_RE.test(p)) {
		score += 1;
	}
	if (/(^|\/)(src|app|lib|api|routes|modules|controllers|services|models|pages|components|backend|frontend)(\/|$)/i.test(p)) {
		score += 2;
	}
	for (const term of terms) {
		if (p.includes(term)) {
			score += 6;
		}
	}
	if (/\/(main|index|app)\.(ts|tsx|js|py)$/i.test(p)) {
		score += 1;
	}
	return score;
}

/** Pick implementation-relevant paths (not only package.json). */
export function discoverLikelyFilesForTicket(
	ticket: JiraTicket,
	relativePaths: string[],
	opts?: { max?: number },
): string[] {
	const max = opts?.max ?? 20;
	const terms = extractTicketSearchTerms(ticket);
	const scored = relativePaths
		.map(path => ({ path, score: scorePathForTicket(path, terms) }))
		.filter(x => x.score > 0)
		.sort((a, b) => b.score - a.score);

	const picked: string[] = [];
	const seen = new Set<string>();
	for (const { path } of scored) {
		if (seen.has(path)) {
			continue;
		}
		seen.add(path);
		picked.push(path);
		if (picked.length >= max) {
			break;
		}
	}
	// Always include a few package roots if monorepo
	for (const p of relativePaths) {
		if (/package\.json$/i.test(p) && picked.length < max) {
			if (!seen.has(p)) {
				picked.push(p);
				seen.add(p);
			}
		}
	}
	return picked.slice(0, max);
}

export function isSourceOrConfigPath(path: string): boolean {
	return SOURCE_FILE_RE.test(path) || CONFIG_FILE_RE.test(path);
}
