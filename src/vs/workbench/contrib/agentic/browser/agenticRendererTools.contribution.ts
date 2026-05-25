/*--------------------------------------------------------------------------------------
 *  Agentic AI — register renderer tool channel for electron-main
 *--------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { AgenticRendererToolChannel, AGENTIC_RENDERER_TOOLS_CHANNEL } from './services/agenticRendererToolChannel.js';
import { IAgenticVoidToolBridgeService } from './services/agenticVoidToolBridgeService.js';

class AgenticRendererToolsContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agenticRendererTools';

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const bridge = instantiationService.invokeFunction(accessor => accessor.get(IAgenticVoidToolBridgeService));
		mainProcessService.registerChannel(
			AGENTIC_RENDERER_TOOLS_CHANNEL,
			new AgenticRendererToolChannel(bridge),
		);
	}
}

registerWorkbenchContribution2(
	AgenticRendererToolsContribution.ID,
	AgenticRendererToolsContribution,
	WorkbenchPhase.AfterRestored,
);
