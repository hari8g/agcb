/*--------------------------------------------------------------------------------------
 *  Agentic AI — IPC channel (electron-main)
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type {
	EventAgentEventParams,
	EventRunErrorParams,
	MainAbortRunParams,
	MainResolveApprovalParams,
	MainStartRunParams,
} from '../common/agenticProtocol.js';
import { abortLocalRun, resolveApprovalAndContinue, runLocalAgent } from './runtime/localAgentRuntime.js';
import { ExternalAgentRuntimeClient } from './runtime/externalAgentRuntimeClient.js';

export class AgenticRuntimeChannel implements IServerChannel {
	private readonly onAgentEvent = new Emitter<EventAgentEventParams>();
	private readonly onRunError = new Emitter<EventRunErrorParams>();

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onAgentEvent':
				return this.onAgentEvent.event;
			case 'onRunError':
				return this.onRunError.event;
			default:
				throw new Error(`Agentic channel event not found: ${event}`);
		}
	}

	async call(_: unknown, command: string, params: any): Promise<any> {
		switch (command) {
			case 'startRun':
				this._startRun(params as MainStartRunParams);
				return;
			case 'abortRun':
				abortLocalRun((params as MainAbortRunParams).requestId);
				return;
			case 'resolveApproval':
				await resolveApprovalAndContinue(
					(params as MainResolveApprovalParams).requestId,
					(params as MainResolveApprovalParams).decision === 'approved' ? 'approved' : 'rejected',
				);
				return;
			default:
				throw new Error(`Agentic channel command not found: ${command}`);
		}
	}

	private _startRun(params: MainStartRunParams): void {
		const { requestId, request } = params;
		const emit = (event: EventAgentEventParams['event']) => {
			this.onAgentEvent.fire({ requestId, event });
		};

		const run = async () => {
			try {
				if (request.options.runtimeMode === 'external_agent_runtime') {
					const client = new ExternalAgentRuntimeClient({
						gatewayUrl: request.options.externalGatewayUrl || process.env.AGENTIC_GATEWAY_URL || 'dev://local',
						apiKeyEnvVar: request.options.apiKeyEnvVar,
						requestTimeoutMs: request.options.requestTimeoutMs,
					});
					const res = await client.startRun(request, ev => emit(ev), requestId);
					if (!res.ok) {
						this.onRunError.fire({ requestId, message: res.error ?? 'External runtime failed' });
					}
					return;
				}
				await runLocalAgent(requestId, request, emit);
			} catch (e) {
				this.onRunError.fire({
					requestId,
					message: e instanceof Error ? e.message : String(e),
					fullError: e instanceof Error ? e.stack : undefined,
				});
			}
		};

		void run();
	}
}
