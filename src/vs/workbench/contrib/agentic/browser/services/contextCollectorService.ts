/*--------------------------------------------------------------------------------------
 *  Agentic AI — collect IDE context before agent runs
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { EndOfLinePreference } from '../../../../../editor/common/model.js';
import { CONTEXT_LIMITS, CodebaseContext, emptyCodeGraphContext } from '../../common/contextTypes.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ICodeIntelligenceService } from './codeIntelligenceService.js';
import { extractSymbolsLexical } from '../../common/codeIntelligenceTypes.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

const RECENT_FILES_KEY = 'agentic.recentFiles.v1';

export const IContextCollectorService = createDecorator<IContextCollectorService>('agenticContextCollectorService');

export interface IContextCollectorService {
	readonly _serviceBrand: undefined;
	collect(userMessage: string, opts: {
		includeActiveFile: boolean;
		includeSelection: boolean;
		enableSemanticSearch?: boolean;
		semanticSearchLimit?: number;
		/** Skip full active file body; rely on index + tools (Cursor dynamic context) */
		dynamicContextDiscovery?: boolean;
		extraContextBlocks?: string[];
		/** Orchestration context tier */
		includeOpenTabs?: boolean;
		includeRecentFiles?: boolean;
		includeRelatedTests?: boolean;
		relatedTestPaths?: string[];
	}): Promise<CodebaseContext>;
}

class ContextCollectorService extends Disposable implements IContextCollectorService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICodeIntelligenceService private readonly codeIntelligence: ICodeIntelligenceService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	async collect(userMessage: string, opts: {
		includeActiveFile: boolean;
		includeSelection: boolean;
		enableSemanticSearch?: boolean;
		semanticSearchLimit?: number;
		dynamicContextDiscovery?: boolean;
		extraContextBlocks?: string[];
		includeOpenTabs?: boolean;
		includeRecentFiles?: boolean;
		includeRelatedTests?: boolean;
		relatedTestPaths?: string[];
	}): Promise<CodebaseContext> {
		const folders = this.workspaceContextService.getWorkspace().folders.map(f => f.uri.fsPath);
		const control = this.editorService.activeTextEditorControl;
		const codeEditor = control && isCodeEditor(control) ? control : undefined;
		const model = codeEditor?.getModel() ?? null;
		const activeUri = model?.uri;

		let activeFileContent: string | null = null;
		let selectedCode: string | null = null;
		let selectionRange: { startLine: number; endLine: number } | null = null;

		if (opts.includeActiveFile && model && activeUri && !opts.dynamicContextDiscovery) {
			const full = model.getValue(EndOfLinePreference.LF);
			activeFileContent = full.slice(0, CONTEXT_LIMITS.maxActiveFileChars);
		} else if (opts.includeActiveFile && activeUri && opts.dynamicContextDiscovery) {
			activeFileContent = `[Dynamic context] Active file: ${activeUri.fsPath} — use read_file when you need contents.`;
		}

		if (opts.includeSelection && codeEditor && model) {
			const sel = codeEditor.getSelection();
			if (sel && !sel.isEmpty()) {
				selectedCode = model.getValueInRange(sel, EndOfLinePreference.LF).slice(0, CONTEXT_LIMITS.maxSelectedCodeChars);
				selectionRange = { startLine: sel.startLineNumber, endLine: sel.endLineNumber };
			}
		}

		const openTabs: CodebaseContext['openTabs'] = [];
		if (opts.includeOpenTabs !== false) {
			for (const group of this.editorGroupsService.groups) {
				for (const editor of group.editors) {
					if (openTabs.length >= CONTEXT_LIMITS.maxOpenTabs) break;
					const res = editor.resource;
					if (!res) continue;
					openTabs.push({
						path: res.fsPath,
						languageId: this.modelService.getModel(res)?.getLanguageId() ?? 'plaintext',
						isActive: activeUri?.fsPath === res.fsPath,
					});
				}
			}
		}

		if (activeUri?.fsPath) {
			this._trackRecentFile(activeUri.fsPath);
		}

		const recentFiles = opts.includeRecentFiles !== false
			? this._loadRecentFiles().slice(0, CONTEXT_LIMITS.maxRecentFiles)
			: [];
		const gitBranch: string | null = null; // SCM/git integration can be wired via ISCMService

		const semanticLimit = opts.dynamicContextDiscovery
			? Math.min(opts.semanticSearchLimit ?? 10, 5)
			: (opts.semanticSearchLimit ?? 10);
		const relevant = opts.enableSemanticSearch !== false
			? await this.codeIntelligence.getRelevantContext(userMessage, semanticLimit)
			: [];
		const codeGraph = emptyCodeGraphContext();
		codeGraph.semanticMatches = relevant.map(r => ({
			path: r.path,
			snippet: r.snippet.slice(0, 800),
			score: r.score,
		}));

		if (activeUri?.fsPath && activeFileContent) {
			const lang = model?.getLanguageId() ?? 'plaintext';
			const syms = extractSymbolsLexical(activeFileContent, lang);
			codeGraph.symbols = syms.map(s => `${s.name} (${s.kind}, L${s.line})`);
		}

		if (opts.extraContextBlocks?.length) {
			codeGraph.knowledgeGraphDigest = [
				codeGraph.knowledgeGraphDigest ?? '',
				...opts.extraContextBlocks,
			].filter(Boolean).join('\n\n');
		}

		if (opts.includeRelatedTests && opts.relatedTestPaths?.length) {
			codeGraph.knowledgeGraphDigest = [
				codeGraph.knowledgeGraphDigest ?? '',
				`<related_tests>\n${opts.relatedTestPaths.join('\n')}\n</related_tests>`,
			].filter(Boolean).join('\n\n');
		}

		return {
			workspaceFolderUris: folders,
			userMessage,
			activeFilePath: activeUri?.fsPath ?? null,
			activeFileLanguageId: model?.getLanguageId() ?? null,
			activeFileContent,
			selectedCode,
			selectionRange,
			openTabs,
			gitBranch,
			recentFiles,
			checkpointId: null,
			codeGraph,
			jiraIssues: [],
			collectedAt: Date.now(),
		};
	}

	private _trackRecentFile(path: string): void {
		const list = this._loadRecentFiles().filter(p => p !== path);
		list.unshift(path);
		this.storageService.store(
			RECENT_FILES_KEY,
			JSON.stringify(list.slice(0, CONTEXT_LIMITS.maxRecentFiles)),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
	}

	private _loadRecentFiles(): string[] {
		const raw = this.storageService.get(RECENT_FILES_KEY, StorageScope.WORKSPACE);
		if (!raw) return [];
		try {
			return JSON.parse(raw) as string[];
		} catch {
			return [];
		}
	}

}

registerSingleton(IContextCollectorService, ContextCollectorService, InstantiationType.Delayed);
