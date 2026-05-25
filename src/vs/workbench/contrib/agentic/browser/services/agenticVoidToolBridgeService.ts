/*--------------------------------------------------------------------------------------
 *  Agentic AI — delegate file edits and lint reads to Void IToolsService
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import type { IToolsService } from '../../../void/browser/toolsService.js';
import type { LintErrorItem } from '../../../void/common/toolsServiceTypes.js';

/** Same id as Void `IToolsService` — type-only import avoids circular load with toolsService.ts */
const VoidIToolsService = createDecorator<IToolsService>('ToolsService');
import { extractCreateFileContent, validateSearchReplaceBlocks } from '../../common/editValidator.js';
export const IAgenticVoidToolBridgeService = createDecorator<IAgenticVoidToolBridgeService>('agenticVoidToolBridgeService');

export interface ApplyEditResult {
	lintSummary?: string;
}

export interface IAgenticVoidToolBridgeService {
	readonly _serviceBrand: undefined;
	resolveUri(filePath: string): URI | null;
	readLintErrors(filePath: string): Promise<string>;
	rewriteFile(filePath: string, content: string): Promise<ApplyEditResult>;
	editFile(filePath: string, searchReplaceBlocks: string): Promise<ApplyEditResult>;
	createFileIfMissing(filePath: string): Promise<void>;
}

class AgenticVoidToolBridgeService extends Disposable implements IAgenticVoidToolBridgeService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
	) {
		super();
	}

	private get toolsService(): IToolsService {
		return this.instantiationService.invokeFunction(accessor => accessor.get(VoidIToolsService));
	}

	resolveUri(filePath: string): URI | null {
		const trimmed = filePath.trim();
		if (!trimmed) {
			return null;
		}
		if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
			return URI.file(trimmed);
		}
		const folder = this.workspaceContext.getWorkspace().folders[0]?.uri;
		if (!folder) {
			return URI.file(trimmed);
		}
		return URI.joinPath(folder, trimmed.replace(/\\/g, '/'));
	}

	async createFileIfMissing(filePath: string): Promise<void> {
		const uri = this.resolveUri(filePath);
		if (!uri) {
			return;
		}
		try {
			await this.toolsService.callTool.create_file_or_folder({ uri, isFolder: false });
		} catch {
			// already exists
		}
	}

	async readLintErrors(filePath: string): Promise<string> {
		const uri = this.resolveUri(filePath);
		if (!uri) {
			return 'Invalid file path';
		}
		const { result } = await this.toolsService.callTool.read_lint_errors({ uri });
		const resolved = await Promise.resolve(result);
		return this.toolsService.stringOfResult.read_lint_errors({ uri }, resolved);
	}

	async rewriteFile(filePath: string, content: string): Promise<ApplyEditResult> {
		const uri = this.resolveUri(filePath);
		if (!uri) {
			return {};
		}
		try {
			await this.toolsService.callTool.create_file_or_folder({ uri, isFolder: false });
		} catch {
			// file may already exist
		}
		const { result } = await this.toolsService.callTool.rewrite_file({ uri, newContent: content });
		const resolved = await Promise.resolve(result);
		return { lintSummary: this.formatLint(uri, resolved.lintErrors) };
	}

	async editFile(filePath: string, searchReplaceBlocks: string): Promise<ApplyEditResult> {
		const uri = this.resolveUri(filePath);
		if (!uri || !searchReplaceBlocks.trim()) {
			return {};
		}

		const createContent = extractCreateFileContent(searchReplaceBlocks);
		if (createContent !== undefined && validateSearchReplaceBlocks(searchReplaceBlocks, { allowCreate: true }).ok) {
			return this.rewriteFile(filePath, createContent);
		}

		try {
			await this.toolsService.callTool.create_file_or_folder({ uri, isFolder: false });
		} catch {
			// exists
		}

		const { result } = await this.toolsService.callTool.edit_file({ uri, searchReplaceBlocks });
		const resolved = await Promise.resolve(result);
		return { lintSummary: this.formatLint(uri, resolved.lintErrors) };
	}

	private formatLint(uri: URI, lintErrors: LintErrorItem[] | null): string | undefined {
		const str = this.toolsService.stringOfResult.read_lint_errors({ uri }, { lintErrors });
		return str.includes('No lint errors') ? undefined : str;
	}
}

registerSingleton(IAgenticVoidToolBridgeService, AgenticVoidToolBridgeService, InstantiationType.Delayed);
