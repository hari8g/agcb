/*--------------------------------------------------------------------------------------
 *  Agentic AI — renderer IPC channel (main process calls into workbench)
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { AGENTIC_RENDERER_TOOLS_CHANNEL } from '../../common/agenticProtocol.js';
import { IAgenticVoidToolBridgeService } from './agenticVoidToolBridgeService.js';

export { AGENTIC_RENDERER_TOOLS_CHANNEL };

export class AgenticRendererToolChannel implements IServerChannel {
	constructor(
		private readonly voidToolBridge: IAgenticVoidToolBridgeService,
	) { }

	listen(_: unknown, event: string): never {
		throw new Error(`Agentic renderer tools channel has no events: ${event}`);
	}

	call<T>(_: unknown, command: string, arg?: { path?: string }): Promise<T> {
		switch (command) {
			case 'readLintErrors': {
				const path = String(arg?.path ?? '');
				return this.voidToolBridge.readLintErrors(path) as Promise<T>;
			}
			default:
				throw new Error(`Agentic renderer tools command not found: ${command}`);
		}
	}
}
