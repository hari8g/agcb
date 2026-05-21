/*--------------------------------------------------------------------------------------
 *  Agentic AI — search / grep tools (electron-main)
 *--------------------------------------------------------------------------------------*/

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export function grepTool(workspaceRoot: string, pattern: string, maxMatches = 30): string {
	const re = new RegExp(pattern, 'gi');
	const matches: string[] = [];
	const walk = (dir: string, depth: number) => {
		if (depth > 5 || matches.length >= maxMatches) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			if (name === 'node_modules' || name === '.git' || name === 'out') continue;
			const p = join(dir, name);
			try {
				const st = statSync(p);
				if (st.isDirectory()) {
					walk(p, depth + 1);
				} else if (st.isFile() && st.size < 500_000) {
					const content = readFileSync(p, 'utf8');
					const lines = content.split('\n');
					for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
						if (re.test(lines[i])) {
							matches.push(`${p.slice(workspaceRoot.length + 1)}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
							re.lastIndex = 0;
						}
					}
				}
			} catch { /* ignore */ }
		}
	};
	if (!existsSync(workspaceRoot)) return 'Workspace not found';
	walk(workspaceRoot, 0);
	return matches.length ? matches.join('\n') : 'No matches';
}
