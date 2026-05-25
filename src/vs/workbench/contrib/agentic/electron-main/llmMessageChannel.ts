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
import { queueRunMessageInject } from './runtime/runMessageInject.js';
import type { MainInjectRunMessageParams, MainRestoreCheckpointParams, MainRestoreCheckpointResult } from '../common/agenticProtocol.js';
import { exportCheckpointSnapshot, restoreCheckpoint } from './checkpoints/checkpointService.js';
import type { MainGetCheckpointSnapshotParams } from '../common/agenticProtocol.js';
import { ExternalAgentRuntimeClient } from './runtime/externalAgentRuntimeClient.js';
import { pushAgenticLogSink } from '../common/agenticObservability.js';

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
			case 'injectRunMessage': {
				const p = params as MainInjectRunMessageParams;
				queueRunMessageInject(p.requestId, { role: 'user', content: p.content });
				return;
			}
			case 'restoreCheckpoint': {
				const p = params as MainRestoreCheckpointParams;
				return restoreCheckpoint(p.workspaceFolder, p.checkpointId) satisfies MainRestoreCheckpointResult;
			}
			case 'getCheckpointSnapshot': {
				const p = params as MainGetCheckpointSnapshotParams;
				return exportCheckpointSnapshot(p.checkpointId);
			}
			default:
				throw new Error(`Agentic channel command not found: ${command}`);
		}
	}

	private _startRun(params: MainStartRunParams): void {
		const { requestId, request } = params;
		const emit = (event: EventAgentEventParams['event']) => {
			this.onAgentEvent.fire({ requestId, event });
		};

		const logSink = pushAgenticLogSink(ev => {
			emit({
				type: 'workflow_log',
				runId: request.runId,
				timestamp: Date.now(),
				payload: {
					kind: ev.kind,
					threadId: ev.threadId,
					toolName: ev.toolName,
					message: ev.message,
					durationMs: ev.durationMs,
					meta: ev.meta,
				},
			});
		});

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
			} finally {
				logSink.dispose();
			}
		};

		void run();
	}
}
