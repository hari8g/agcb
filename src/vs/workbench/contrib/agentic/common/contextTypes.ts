/*--------------------------------------------------------------------------------------
 *  Agentic AI — codebase context DTOs
 *--------------------------------------------------------------------------------------*/

export interface OpenTabInfo {
	path: string;
	languageId: string;
	isActive: boolean;
}

export interface CodeGraphContext {
	symbols: string[];
	imports: string[];
	exports: string[];
	callGraphEdges: { from: string; to: string }[];
	referencedFiles: string[];
	semanticMatches: { path: string; snippet: string; score: number }[];
	astSnippets: { path: string; range: string; content: string }[];
	/** Serialized temporal knowledge graph (when enabled) */
	knowledgeGraphDigest?: string;
}

import type { JiraIssueContext } from './mcp/jiraTypes.js';

export interface CodebaseContext {
	workspaceFolderUris: string[];
	userMessage: string;
	activeFilePath: string | null;
	activeFileLanguageId: string | null;
	activeFileContent: string | null;
	selectedCode: string | null;
	selectionRange: { startLine: number; endLine: number } | null;
	openTabs: OpenTabInfo[];
	gitBranch: string | null;
	recentFiles: string[];
	checkpointId: string | null;
	codeGraph: CodeGraphContext;
	jiraIssues: JiraIssueContext[];
	collectedAt: number;
}

export const CONTEXT_LIMITS = {
	maxActiveFileChars: 20_000,
	maxSelectedCodeChars: 10_000,
	maxOpenTabs: 20,
	maxRecentFiles: 20,
} as const;

export function emptyCodeGraphContext(): CodeGraphContext {
	return {
		symbols: [],
		imports: [],
		exports: [],
		callGraphEdges: [],
		referencedFiles: [],
		semanticMatches: [],
		astSnippets: [],
	};
}
