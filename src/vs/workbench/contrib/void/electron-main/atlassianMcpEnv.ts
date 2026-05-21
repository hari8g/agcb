/*--------------------------------------------------------------------------------------
 *  Read Atlassian MCP env from home mcp.json (main process; works without browser file service)
 *--------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MCP_CONFIG_FILE_NAME = 'mcp.json';

/** Merge atlassian env from ~/.void-editor-dev and ~/.void-editor (later paths override). */
export function readAtlassianEnvFromHomeMcpFiles(): Record<string, string> {
	const merged: Record<string, string> = {};
	for (const sub of ['.void-editor-dev', '.void-editor']) {
		try {
			const filePath = path.join(os.homedir(), sub, MCP_CONFIG_FILE_NAME);
			const json = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
				mcpServers?: { atlassian?: { env?: Record<string, string> } };
			};
			const env = json.mcpServers?.atlassian?.env;
			if (env) {
				Object.assign(merged, env);
			}
		} catch {
			// file missing or invalid
		}
	}
	return merged;
}

export function mergeAtlassianEnv(
	browserEnv?: Record<string, string | undefined>,
): Record<string, string | undefined> {
	const fromDisk = readAtlassianEnvFromHomeMcpFiles();
	return { ...fromDisk, ...browserEnv };
}

export interface AtlassianEnvProbeSource {
	label: string;
	ok: boolean;
	keys: string[];
	error?: string;
}

/** Read atlassian env from explicit workspace mcp.json paths (main process fs). */
export function readAtlassianEnvFromWorkspaceMcpFiles(
	workspaceMcpPaths: string[],
): { env: Record<string, string>; sources: AtlassianEnvProbeSource[] } {
	const merged: Record<string, string> = {};
	const sources: AtlassianEnvProbeSource[] = [];
	for (const filePath of workspaceMcpPaths) {
		try {
			const json = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
				mcpServers?: { atlassian?: { env?: Record<string, string> } };
			};
			const env = json.mcpServers?.atlassian?.env;
			if (!env || !Object.keys(env).length) {
				sources.push({ label: filePath, ok: false, keys: [], error: 'no mcpServers.atlassian.env' });
				continue;
			}
			Object.assign(merged, env);
			sources.push({ label: filePath, ok: true, keys: Object.keys(env) });
		} catch (e) {
			sources.push({
				label: filePath,
				ok: false,
				keys: [],
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}
	return { env: merged, sources };
}

export function probeAtlassianEnvOnDisk(opts: {
	workspaceMcpPaths: string[];
	clientEnv?: Record<string, string | undefined>;
}): { env: Record<string, string>; sources: AtlassianEnvProbeSource[] } {
	const sources: AtlassianEnvProbeSource[] = [];
	let merged: Record<string, string> = {};

	const home = readAtlassianEnvFromHomeMcpFiles();
	for (const sub of ['.void-editor-dev', '.void-editor']) {
		const p = path.join(os.homedir(), sub, MCP_CONFIG_FILE_NAME);
		const keys = Object.keys(home);
		sources.push({
			label: p,
			ok: keys.length > 0,
			keys,
			error: keys.length ? undefined : 'missing or no atlassian.env',
		});
	}
	merged = { ...merged, ...home };

	const ws = readAtlassianEnvFromWorkspaceMcpFiles(opts.workspaceMcpPaths);
	sources.push(...ws.sources);
	merged = { ...merged, ...ws.env };

	if (opts.clientEnv && Object.keys(opts.clientEnv).length) {
		for (const [k, v] of Object.entries(opts.clientEnv)) {
			if (v !== undefined) {
				merged[k] = v;
			}
		}
		sources.push({
			label: 'MCP connected client entry (mcpServerEntryJSON.env)',
			ok: true,
			keys: Object.keys(opts.clientEnv),
		});
	}

	return { env: merged, sources };
}
