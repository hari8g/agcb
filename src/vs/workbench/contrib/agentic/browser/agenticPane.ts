/*--------------------------------------------------------------------------------------
 *  Agentic AI — opens JIRA beside Void chat (auxiliary bar); legacy sidebar container removed
 *--------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import * as nls from '../../../../nls.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { VOID_OPEN_SIDEBAR_ACTION_ID } from '../../void/browser/sidebarPane.js';

export const AGENTIC_VIEW_CONTAINER_ID = 'workbench.view.agentic';
export const AGENTIC_VIEW_ID = 'workbench.view.agentic.chat';

/** Sparkle / Agentic AI activity — opens chat + JIRA on the right auxiliary bar. */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openAgentic',
			title: nls.localize2('openAgentic', 'Agentic AI'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID);
	}
});
