/*--------------------------------------------------------------------------------------
 *  Agentic AI — apply agent edits via Void tools (edit_file / rewrite_file)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IVoidModelService } from '../../../void/common/voidModelService.js';
import { IAgenticVoidToolBridgeService } from './agenticVoidToolBridgeService.js';

export const IAgenticEditorBridgeService = createDecorator<IAgenticEditorBridgeService>('agenticEditorBridgeService');

export interface ApplyFileResult {
	lintSummary?: string;
}

export interface IAgenticEditorBridgeService {
	readonly _serviceBrand: undefined;
	openFileInEditor(filePath: string): Promise<void>;
	writeFile(filePath: string, content: string): Promise<ApplyFileResult>;
	previewProposeFileEdit(filePath: string, searchReplaceBlocks: string): Promise<void>;
	finalizeProposeFileEdit(filePath: string, searchReplaceBlocks: string): Promise<ApplyFileResult>;
	cancelProposeFileEdit(filePath: string): void;
}

class AgenticEditorBridgeService extends Disposable implements IAgenticEditorBridgeService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgenticVoidToolBridgeService private readonly voidTools: IAgenticVoidToolBridgeService,
		@IVoidModelService private readonly voidModelService: IVoidModelService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	private async reveal(filePath: string): Promise<void> {
		const uri = this.voidTools.resolveUri(filePath);
		if (!uri) {
			return;
		}
		await this.voidModelService.initializeModel(uri);
		await this.editorService.openEditor({
			resource: uri,
			options: { pinned: true, preserveFocus: false, revealIfVisible: true },
		});
	}

	async openFileInEditor(filePath: string): Promise<void> {
		await this.reveal(filePath);
	}

	async writeFile(filePath: string, content: string): Promise<ApplyFileResult> {
		const result = await this.voidTools.rewriteFile(filePath, content);
		await this.reveal(filePath);
		return result;
	}

	async previewProposeFileEdit(filePath: string, searchReplaceBlocks: string): Promise<void> {
		// Preview stays on live-edit path until finalize; open file for visibility.
		await this.voidTools.createFileIfMissing(filePath);
		await this.reveal(filePath);
	}

	async finalizeProposeFileEdit(filePath: string, searchReplaceBlocks: string): Promise<ApplyFileResult> {
		const result = await this.voidTools.editFile(filePath, searchReplaceBlocks);
		await this.reveal(filePath);
		return result;
	}

	cancelProposeFileEdit(_filePath: string): void {
		// Void diff zones are accepted/rejected in-editor; no-op for agent cancel.
	}
}

registerSingleton(IAgenticEditorBridgeService, AgenticEditorBridgeService, InstantiationType.Delayed);
