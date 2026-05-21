/*--------------------------------------------------------------------------------------
 *  Agentic AI — file tools (electron-main)
 *--------------------------------------------------------------------------------------*/

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export function readFileTool(workspaceRoot: string, path: string, maxChars = 100_000): string {
	const full = resolve(workspaceRoot, path);
	if (!existsSync(full)) return `Error: file not found: ${path}`;
	const content = readFileSync(full, 'utf8');
	if (content.length > maxChars) {
		return content.slice(0, maxChars) + `\n... truncated (${content.length} chars total)`;
	}
	return content;
}

export function listFilesTool(workspaceRoot: string, dirPath: string): string {
	const full = resolve(workspaceRoot, dirPath || '.');
	if (!existsSync(full)) return `Error: directory not found: ${dirPath}`;
	const entries = readdirSync(full).slice(0, 200);
	return entries.join('\n');
}

export function searchFilesTool(workspaceRoot: string, query: string): string {
	const results: string[] = [];
	const walk = (dir: string, depth: number) => {
		if (depth > 4 || results.length > 50) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			if (name === 'node_modules' || name === '.git' || name === 'out') continue;
			const p = join(dir, name);
			if (name.toLowerCase().includes(query.toLowerCase())) {
				results.push(p.slice(workspaceRoot.length + 1));
			}
			try {
				if (statSync(p).isDirectory()) walk(p, depth + 1);
			} catch { /* ignore */ }
		}
	};
	walk(workspaceRoot, 0);
	return results.length ? results.join('\n') : 'No matches';
}
