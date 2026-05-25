/*--------------------------------------------------------------------------------------
 *  Agentic AI — @ mention path resolution (extracted from chatThreadService)
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { buildMentionsContextBlock } from '../../common/contextMentions.js';
import type { IFileService } from '../../../../../platform/files/common/files.js';

export interface MentionResolverDeps {
	fileService: IFileService;
	searchComposerContext(query: string): Promise<{ path: string; score: number }[]>;
}

export async function loadMentionSnippets(
	deps: MentionResolverDeps,
	paths: string[],
): Promise<string> {
	const blocks: { path: string; snippet?: string; error?: string }[] = [];
	for (const p of paths.slice(0, 6)) {
		try {
			const full = (await deps.fileService.readFile(URI.file(p))).value.toString();
			blocks.push({ path: p, snippet: full.slice(0, 8000) });
		} catch {
			blocks.push({ path: p, error: 'Could not read file — use read_file in workspace' });
		}
	}
	return buildMentionsContextBlock(blocks);
}

export async function resolveMentionPaths(
	deps: MentionResolverDeps,
	workspaceRoots: string[],
	paths: string[],
): Promise<string[]> {
	const resolved: string[] = [];
	for (const p of paths) {
		let found = false;
		for (const root of workspaceRoots) {
			const full = `${root}/${p.replace(/^[/\\]/, '')}`;
			try {
				await deps.fileService.stat(URI.file(full));
				resolved.push(full);
				found = true;
				break;
			} catch { /* try next root */ }
		}
		if (!found) {
			const fuzzy = await fuzzyResolveMentionPath(deps, p, workspaceRoots);
			if (fuzzy) {
				resolved.push(fuzzy);
			} else {
				resolved.push(p);
			}
		}
	}
	return resolved;
}

async function fuzzyResolveMentionPath(
	deps: MentionResolverDeps,
	mention: string,
	roots: string[],
): Promise<string | undefined> {
	const base = mention.split(/[/\\]/).pop() ?? mention;
	const alternates = new Set<string>([base]);
	if (/^model\.py$/i.test(base)) {
		alternates.add('models.py');
	}
	if (/\.py$/i.test(base) && !/s\.py$/i.test(base)) {
		alternates.add(base.replace(/\.py$/i, 's.py'));
	}
	try {
		const hits = await deps.searchComposerContext(base.replace(/\.[^.]+$/, ''));
		for (const alt of alternates) {
			const match = hits.find(h => h.path.endsWith(`/${alt}`) || h.path.endsWith(alt));
			if (match) {
				for (const root of roots) {
					const full = match.path.startsWith(root)
						? match.path
						: `${root}/${match.path.replace(/^[/\\]/, '')}`;
					try {
						await deps.fileService.stat(URI.file(full));
						return full;
					} catch { /* next root */ }
				}
			}
		}
	} catch { /* no index */ }
	return undefined;
}
