/*--------------------------------------------------------------------------------------
 *  Agentic AI — JIRA tab commands (UI is a tab inside Void auxiliary chat shell)
 *--------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { VOID_COMPOSER_VIEW_CONTAINER_ID } from '../../void/browser/composerPane.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

export const AGENTIC_JIRA_VIEW_ID = 'workbench.view.agentic.jira';
export const AGENTIC_OPEN_JIRA_ACTION_ID = 'agentic.openJira';

/** Open Composer auxiliary view (JIRA workflow). */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: AGENTIC_OPEN_JIRA_ACTION_ID,
			title: nls.localize2('agenticOpenJira', 'Open JIRA'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IViewsService).openViewContainer(VOID_COMPOSER_VIEW_CONTAINER_ID);
	}
});
