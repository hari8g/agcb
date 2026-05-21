/*--------------------------------------------------------------------------------------
 *  Agentic AI — agent loop facade (browser orchestration entry)
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgenticChatThreadService } from './chatThreadService.js';

export const IAgentLoopService = createDecorator<IAgentLoopService>('agenticAgentLoopService');

export interface IAgentLoopService {
	readonly _serviceBrand: undefined;
	runUserTurn(text: string): Promise<void>;
	stop(): void;
}

class AgentLoopService implements IAgentLoopService {
	declare readonly _serviceBrand: undefined;
	constructor(@IAgenticChatThreadService private readonly chatThreads: IAgenticChatThreadService) { }

	runUserTurn(text: string): Promise<void> {
		return this.chatThreads.sendUserMessage(text);
	}

	stop(): void {
		this.chatThreads.stopCurrentRun();
	}
}

registerSingleton(IAgentLoopService, AgentLoopService, InstantiationType.Delayed);
