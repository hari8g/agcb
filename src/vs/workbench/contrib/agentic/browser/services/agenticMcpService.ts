/*--------------------------------------------------------------------------------------
 *  Agentic AI — MCP client bridge (browser → Void IMCPService)
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	buildMcpParamsFromInputSchema,
	mcpToolBaseName,
	resolveAtlassianCloudId,
} from '../../common/mcp/jiraContextExtractor.js';
import { IMCPService } from '../../../void/common/mcpService.js';
import type { InternalToolInfo } from '../../../void/common/prompt/prompts.js';
import type { SerializableMcpTool } from '../../common/mcp/agenticMcpTypes.js';
import {
	buildJiraCommentParams,
	buildJiraIssueToolParams,
	buildJiraSearchParams,
	buildJiraTransitionParams,
	buildAllTicketsJql,
	inferJiraProjectKeyFromEnv,
	describeJiraMcpUnavailableMessage,
	extractJiraIssueKeys,
	findJiraCommentTool,
	findJiraGetIssueTool,
	findJiraGetTransitionsTool,
	findJiraSearchTool,
	findJiraTransitionTool,
	parseIssueFromMcpText,
} from '../../common/mcp/jiraContextExtractor.js';
import {
	parseJiraSearchResults,
	parseJiraTicketFromMcpText,
	parseJiraTransitions,
	pickTransitionForStatus,
} from '../../common/mcp/jiraIssueParser.js';
import type { JiraTicket } from '../../common/mcp/jiraWorkflowTypes.js';
import { annotateTicketOpenState } from '../../common/mcp/jiraTicketStatus.js';
import type { JiraIssueContext } from '../../common/mcp/jiraTypes.js';
import {
	buildAtlassianEnvDiagnostics,
	classifyJiraMcpErrorMessage,
	formatAtlassianEnvDiagnosticsBlock,
	formatJiraFetchFailureMessage,
	type AtlassianEnvDiagnostics,
	type AtlassianEnvSourceProbe,
} from '../../common/mcp/jiraMcpDiagnostics.js';
import { IVoidSettingsService } from '../../../void/common/voidSettingsService.js';
import { IAgenticSettingsService } from './agenticSettingsService.js';

const HOME_MCP_SUBDIRS = ['.void-editor-dev', '.void-editor'] as const;

export const IAgenticMcpService = createDecorator<IAgenticMcpService>('agenticMcpService');

export interface IAgenticMcpService {
	readonly _serviceBrand: undefined;
	getSerializableTools(): SerializableMcpTool[];
	isMcpTool(name: string): boolean;
	callTool(serverName: string, toolName: string, params: Record<string, unknown>): Promise<string>;
	fetchJiraIssuesForMessage(userMessage: string): Promise<JiraIssueContext[]>;
	revealMcpConfig(): Promise<void>;
	getConnectedServerNames(): string[];
	getMcpServerEnvs(): Promise<Record<string, Record<string, string | undefined>>>;
	/** Live env diagnostics for system prompt (main-process fs probe). */
	getAtlassianEnvDiagnosticsPrompt(): Promise<string>;
	validateAtlassianReady(): Promise<{ ok: boolean; message: string }>;
	/** Wait until Atlassian MCP is connected and search tool is available. */
	ensureAtlassianMcpReady(maxWaitMs?: number): Promise<void>;
	getJiraMcpStatusSummary(): Promise<string>;
	listOpenTickets(projectKey?: string, maxResults?: number): Promise<JiraTicket[]>;
	/** Open + closed tickets for in-chat list (closed shown greyed out). */
	listAllTickets(projectKey?: string, maxResults?: number): Promise<JiraTicket[]>;
	fetchTicketDetails(ticketKey: string): Promise<JiraTicket>;
	getAvailableTransitions(ticketKey: string): Promise<{ id: string; name: string }[]>;
	transitionTicket(ticketKey: string, transitionId: string): Promise<string>;
	addTicketComment(ticketKey: string, commentBody: string): Promise<string>;
	transitionTicketToStatus(ticketKey: string, targetStatus: string): Promise<string>;
}

class AgenticMcpService extends Disposable implements IAgenticMcpService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IMCPService private readonly mcpService: IMCPService,
		@IVoidSettingsService private readonly voidSettings: IVoidSettingsService,
		@IAgenticSettingsService private readonly agenticSettings: IAgenticSettingsService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	getConnectedServerNames(): string[] {
		return Object.keys(this.mcpService.state.mcpServerOfName).filter(name => {
			const s = this.mcpService.state.mcpServerOfName[name];
			return s.status === 'success';
		});
	}

	async getMcpServerEnvs(): Promise<Record<string, Record<string, string | undefined>>> {
		const envs: Record<string, Record<string, string | undefined>> = {};
		const { env: atlassianEnv } = await this._probeAtlassianEnv();
		if (Object.keys(atlassianEnv).length > 0) {
			envs.atlassian = atlassianEnv;
		}
		for (const name of Object.keys(this.mcpService.state.mcpServerOfName)) {
			if (name === 'atlassian') {
				continue;
			}
			const env = await this.mcpService.ensureMcpServerEnv(name);
			if (env) {
				envs[name] = env;
			}
		}
		return envs;
	}

	async getAtlassianEnvDiagnosticsPrompt(): Promise<string> {
		const { diagnostics } = await this._probeAtlassianEnv();
		const block = formatAtlassianEnvDiagnosticsBlock(diagnostics);
		if (diagnostics.cloudId && diagnostics.hasEmail && diagnostics.hasToken) {
			return `${block}\n<jira_env_status>READY — use fetch_jira_issue; do not ask user to set ATLASSIAN_SITE.</jira_env_status>`;
		}
		return `${block}\n<jira_env_status>NOT_READY — report <jira_fetch_failure> from context/tools; do not claim ATLASSIAN_SITE is missing if diagnostics show it resolved.</jira_env_status>`;
	}

	/** Main-process fs probe first (reliable); browser fileService as fallback. */
	private async _probeAtlassianEnv(): Promise<{
		env: Record<string, string | undefined>;
		diagnostics: AtlassianEnvDiagnostics;
	}> {
		const workspaceMcpPaths = this.workspaceContextService.getWorkspace().folders.map(
			f => `${f.uri.fsPath}/mcp.json`,
		);
		const sources: AtlassianEnvSourceProbe[] = [];
		let merged: Record<string, string | undefined> = {};

		const fromMain = await this.mcpService.probeAtlassianEnv(workspaceMcpPaths);
		if (fromMain) {
			merged = { ...fromMain.env };
			sources.push(...fromMain.sources);
		} else {
			sources.push({
				label: 'main process probeAtlassianEnv (IPC)',
				ok: false,
				keys: [],
				error: 'IPC returned null',
			});
			const userHome = await this.pathService.userHome();
			for (const sub of HOME_MCP_SUBDIRS) {
				const label = `~/${sub}/mcp.json (browser fallback)`;
				try {
					const env = await this._readAtlassianEnvFromMcpFile(URI.joinPath(userHome, sub, 'mcp.json'));
					sources.push({ label, ok: true, keys: Object.keys(env) });
					merged = { ...merged, ...env };
				} catch (e) {
					sources.push({
						label,
						ok: false,
						keys: [],
						error: e instanceof Error ? e.message : String(e),
					});
				}
			}
			for (const folder of this.workspaceContextService.getWorkspace().folders) {
				const label = `${folder.uri.fsPath}/mcp.json (browser fallback)`;
				try {
					const env = await this._readAtlassianEnvFromMcpFile(URI.joinPath(folder.uri, 'mcp.json'));
					sources.push({ label, ok: true, keys: Object.keys(env) });
					merged = { ...merged, ...env };
				} catch (e) {
					sources.push({
						label,
						ok: false,
						keys: [],
						error: e instanceof Error ? e.message : 'file not found',
					});
				}
			}
		}

		const diagnostics = buildAtlassianEnvDiagnostics(merged, {
			sources,
			workspaceMcpPaths,
			homeConfigHint: '~/.void-editor-dev/mcp.json (Open MCP config)',
		});
		return { env: merged, diagnostics };
	}

	private async _readAtlassianEnvFromMcpFile(uri: URI): Promise<Record<string, string | undefined>> {
		const file = await this.fileService.readFile(uri);
		const json = JSON.parse(file.value.toString()) as { mcpServers?: { atlassian?: { env?: Record<string, string> } } };
		const env = json.mcpServers?.atlassian?.env;
		if (!env) {
			throw new Error('no mcpServers.atlassian.env');
		}
		return env;
	}

	private _failedIssue(
		issueKey: string,
		kind: Parameters<typeof formatJiraFetchFailureMessage>[0],
		diag: AtlassianEnvDiagnostics,
		detail?: string,
	): JiraIssueContext {
		const rawText = formatJiraFetchFailureMessage(kind, diag, detail);
		return {
			issueKey,
			rawText,
			diagnostics: rawText,
			fetchedAt: Date.now(),
		};
	}

	getSerializableTools(): SerializableMcpTool[] {
		const mcpTools = this.mcpService.getMCPTools();
		if (!mcpTools?.length) {
			return [];
		}
		const voidAutoApprove = this.voidSettings.state.globalSettings.autoApprove['MCP tools'] ?? false;
		const requireMcpApproval = this.agenticSettings.settings.requireApprovalForMcpTools;
		const autoApproveMcp = voidAutoApprove && !requireMcpApproval;
		return mcpTools.map(t => this._toSerializable(t, autoApproveMcp));
	}

	isMcpTool(name: string): boolean {
		return this.getSerializableTools().some(t => t.name === name);
	}

	async callTool(serverName: string, toolName: string, params: Record<string, unknown>): Promise<string> {
		const { result } = await this.mcpService.callMCPTool({ serverName, toolName, params });
		return this.mcpService.stringifyResult(result);
	}

	async fetchJiraIssuesForMessage(userMessage: string): Promise<JiraIssueContext[]> {
		const keys = extractJiraIssueKeys(userMessage);
		if (!keys.length) {
			return [];
		}

		const { env: atlassianEnv, diagnostics: diag } = await this._probeAtlassianEnv();
		const tools = this.getSerializableTools();
		const getTool = findJiraGetIssueTool(tools);
		const cloudId = resolveAtlassianCloudId(atlassianEnv);

		if (!getTool) {
			const rawText = describeJiraMcpUnavailableMessage(
				this.mcpService.getMcpConfigPathLabel(),
				this.mcpService.state.mcpServerOfName,
				this.mcpService.state.error,
				tools,
				atlassianEnv,
				diag.workspaceMcpPaths.join(', ') || undefined,
			);
			const kind = classifyJiraMcpErrorMessage(rawText);
			return keys.map(key => this._failedIssue(key, kind === 'unknown' ? 'mcp_not_connected' : kind, diag, rawText));
		}

		if (!cloudId) {
			const kind = !diag.hasEmail || !diag.hasToken ? 'missing_credentials' : 'missing_site';
			return keys.map(key => this._failedIssue(key, kind, diag));
		}

		if (!diag.hasEmail || !diag.hasToken) {
			return keys.map(key => this._failedIssue(key, 'missing_credentials', diag,
				'Teamwork Graph / Rovo MCP requires ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN (Rovo MCP scoped token).'));
		}

		const issues: JiraIssueContext[] = [];
		for (const key of keys.slice(0, 3)) {
			try {
				const params = buildJiraIssueToolParams(getTool, key, atlassianEnv);
				const text = await this.callTool(getTool.serverName, getTool.name, params);
				const issue = parseIssueFromMcpText(text, key);
				if (/legacy api token|twg request failed|tool call error|forbidden|unauthorized|"error":\s*true/i.test(issue.rawText ?? text)) {
					const kind = classifyJiraMcpErrorMessage(issue.rawText ?? text);
					issues.push(this._failedIssue(key, kind, diag, issue.rawText ?? text));
				} else {
					issue.diagnostics = [
						'<jira_fetch_status>OK</jira_fetch_status>',
						formatAtlassianEnvDiagnosticsBlock(diag),
						`Fetched via ${mcpToolBaseName(getTool.name)} (cloudId=${cloudId}).`,
					].join('\n');
					issues.push(issue);
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				const kind = classifyJiraMcpErrorMessage(msg);
				issues.push(this._failedIssue(key, kind, diag, msg));
			}
		}
		return issues;
	}

	async revealMcpConfig(): Promise<void> {
		await this.mcpService.revealMCPConfigFile();
	}

	async validateAtlassianReady(): Promise<{ ok: boolean; message: string }> {
		const { diagnostics } = await this._probeAtlassianEnv();
		const atlassian = this.mcpService.state.mcpServerOfName['atlassian'];
		if (!atlassian) {
			return { ok: false, message: 'No "atlassian" server in MCP config. Add it via MCP config or workspace mcp.json.' };
		}
		if (atlassian.status === 'offline') {
			return { ok: false, message: 'Atlassian MCP is off. Enable it in Settings → MCP (search "MCP").' };
		}
		if (atlassian.status === 'loading') {
			return { ok: false, message: 'Atlassian MCP is still connecting… wait a few seconds and retry.' };
		}
		if (atlassian.status === 'error') {
			return { ok: false, message: `Atlassian MCP error: ${atlassian.error ?? 'unknown'}` };
		}
		if (!this.getConnectedServerNames().includes('atlassian')) {
			return { ok: false, message: 'Atlassian MCP is not connected yet. Wait for terminal: "Connected via HTTP to atlassian".' };
		}
		if (!diagnostics.cloudId) {
			return { ok: false, message: 'Set ATLASSIAN_SITE in mcp.json (e.g. https://yoursite.atlassian.net).' };
		}
		if (!diagnostics.hasEmail || !diagnostics.hasToken) {
			return { ok: false, message: 'Set ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN in mcp.json.' };
		}
		const searchTool = findJiraSearchTool(this.getSerializableTools());
		if (!searchTool) {
			return { ok: false, message: 'Atlassian connected but searchJiraIssuesUsingJql is not loaded. Toggle MCP server off/on.' };
		}
		return { ok: true, message: 'Atlassian MCP ready.' };
	}

	async ensureAtlassianMcpReady(maxWaitMs = 25_000): Promise<void> {
		const deadline = Date.now() + maxWaitMs;
		let lastMsg = 'Waiting for Atlassian MCP…';
		while (Date.now() < deadline) {
			const ready = await this.validateAtlassianReady();
			if (ready.ok) {
				return;
			}
			lastMsg = ready.message;
			await new Promise(r => setTimeout(r, 400));
		}
		throw new Error(lastMsg);
	}

	async getJiraMcpStatusSummary(): Promise<string> {
		try {
			const ready = await this.validateAtlassianReady();
			return ready.message;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	}

	async listOpenTickets(projectKey?: string, maxResults = 25): Promise<JiraTicket[]> {
		const all = await this.listAllTickets(projectKey, maxResults);
		return all.filter(t => t.isOpen !== false);
	}

	async listAllTickets(projectKey?: string, maxResults = 40): Promise<JiraTicket[]> {
		await this.ensureAtlassianMcpReady();
		const { env } = await this._probeAtlassianEnv();
		const tools = this.getSerializableTools();
		const searchTool = findJiraSearchTool(tools);
		if (!searchTool) {
			throw new Error('searchJiraIssuesUsingJql is not available on the Atlassian MCP server.');
		}
		const jql = buildAllTicketsJql(projectKey ?? inferJiraProjectKeyFromEnv(env));
		const params = buildJiraSearchParams(searchTool, jql, env, maxResults);
		const text = await this.callTool(searchTool.serverName, searchTool.name, params);
		const tickets = annotateTicketOpenState(parseJiraSearchResults(text));
		if (!tickets.length && /error|failed/i.test(text)) {
			throw new Error(this._userSafeMcpError(text));
		}
		return tickets;
	}

	async fetchTicketDetails(ticketKey: string): Promise<JiraTicket> {
		const key = ticketKey.trim().toUpperCase();
		const issues = await this.fetchJiraIssuesForMessage(key);
		const issue = issues.find(i => i.issueKey === key) ?? issues[0];
		if (!issue || issue.diagnostics?.includes('jira_fetch_failure') || /failure|not ready/i.test(issue.rawText ?? '')) {
			throw new Error(issue?.rawText?.slice(0, 500) ?? `Could not fetch ${key}`);
		}
		return parseJiraTicketFromMcpText(issue.rawText ?? '', key);
	}

	async getAvailableTransitions(ticketKey: string): Promise<{ id: string; name: string }[]> {
		const { env } = await this._probeAtlassianEnv();
		const tools = this.getSerializableTools();
		const trTool = findJiraGetTransitionsTool(tools);
		if (!trTool) {
			return [];
		}
		const params = buildMcpParamsFromInputSchema(trTool.inputSchema, ticketKey, env);
		const text = await this.callTool(trTool.serverName, trTool.name, params);
		return parseJiraTransitions(text);
	}

	async transitionTicket(ticketKey: string, transitionId: string): Promise<string> {
		const { env } = await this._probeAtlassianEnv();
		const tools = this.getSerializableTools();
		const trTool = findJiraTransitionTool(tools);
		if (!trTool) {
			throw new Error('transitionJiraIssue is not available on the Atlassian MCP server.');
		}
		const params = buildJiraTransitionParams(trTool, ticketKey, transitionId, env);
		return this.callTool(trTool.serverName, trTool.name, params);
	}

	async addTicketComment(ticketKey: string, commentBody: string): Promise<string> {
		const { env } = await this._probeAtlassianEnv();
		const tools = this.getSerializableTools();
		const commentTool = findJiraCommentTool(tools);
		if (!commentTool) {
			throw new Error('addCommentToJiraIssue is not available on the Atlassian MCP server.');
		}
		const params = buildJiraCommentParams(commentTool, ticketKey, commentBody, env);
		return this.callTool(commentTool.serverName, commentTool.name, params);
	}

	/** Transition to closest matching status name; returns result text. */
	async transitionTicketToStatus(ticketKey: string, targetStatus: string): Promise<string> {
		const transitions = await this.getAvailableTransitions(ticketKey);
		if (!transitions.length) {
			throw new Error(`No transitions available for ${ticketKey}.`);
		}
		const pick = pickTransitionForStatus(transitions, targetStatus);
		if (!pick) {
			throw new Error(`No transition matches "${targetStatus}". Available: ${transitions.map(t => t.name).join(', ')}`);
		}
		return this.transitionTicket(ticketKey, pick.id);
	}

	private _userSafeMcpError(text: string): string {
		return text.replace(/ATATT[\w=-]+/gi, '[redacted-token]').slice(0, 600);
	}

	private _toSerializable(t: InternalToolInfo, autoApproveMcp: boolean): SerializableMcpTool {
		return {
			name: t.name,
			description: t.description,
			serverName: t.mcpServerName ?? 'unknown',
			inputSchema: t.mcpInputSchema ?? {
				type: 'object',
				properties: Object.fromEntries(
					Object.entries(t.params).map(([k, v]) => [k, { type: 'string', description: v.description }]),
				),
			},
			requiresApproval: !autoApproveMcp,
		};
	}
}

registerSingleton(IAgenticMcpService, AgenticMcpService, InstantiationType.Delayed);
