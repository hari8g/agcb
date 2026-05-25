/*--------------------------------------------------------------------------------------
 *  Agentic AI — load .voidrules / .cursorrules (Cursor-compatible team rules)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { buildWorkspaceRulesPromptBlock, WORKSPACE_RULES_FILENAMES } from '../../common/workspaceRules.js';

export const IAgenticWorkspaceRulesService = createDecorator<IAgenticWorkspaceRulesService>('agenticWorkspaceRulesService');

export interface IAgenticWorkspaceRulesService {
	readonly _serviceBrand: undefined;
	getRulesPromptBlock(): Promise<string>;
}

class AgenticWorkspaceRulesService extends Disposable implements IAgenticWorkspaceRulesService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
	) {
		super();
	}

	async getRulesPromptBlock(): Promise<string> {
		let voidRules = '';
		let cursorRules = '';
		for (const folder of this.workspaceContext.getWorkspace().folders) {
			for (const name of WORKSPACE_RULES_FILENAMES) {
				const uri = URI.joinPath(folder.uri, name);
				try {
					const content = (await this.fileService.readFile(uri)).value.toString().trim();
					if (!content) {
						continue;
					}
					if (name === '.voidrules') {
						voidRules += (voidRules ? '\n\n' : '') + content;
					} else {
						cursorRules += (cursorRules ? '\n\n' : '') + content;
					}
				} catch {
					// missing file
				}
			}
		}
		return buildWorkspaceRulesPromptBlock(voidRules, cursorRules);
	}
}

registerSingleton(IAgenticWorkspaceRulesService, AgenticWorkspaceRulesService, InstantiationType.Delayed);
