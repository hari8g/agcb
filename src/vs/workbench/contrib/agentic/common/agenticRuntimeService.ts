/*--------------------------------------------------------------------------------------
 *  Agentic AI — browser runtime client (IPC to electron-main)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event } from '../../../../base/common/event.js';
import type { AgentEvent } from './agenticTypes.js';
import {
	AGENTIC_CHANNEL_NAME,
	EventAgentEventParams,
	EventRunErrorParams,
	MainAbortRunParams,
	MainInjectRunMessageParams,
	MainResolveApprovalParams,
	MainGetCheckpointSnapshotParams,
	MainGetCheckpointSnapshotResult,
	MainRestoreCheckpointParams,
	MainRestoreCheckpointResult,
	MainStartRunParams,
	ServiceResolveApprovalParams,
	ServiceStartRunParams,
} from './agenticProtocol.js';

export const IAgenticRuntimeService = createDecorator<IAgenticRuntimeService>('agenticRuntimeService');

export interface IAgenticRuntimeService {
	readonly _serviceBrand: undefined;
	startRun(params: ServiceStartRunParams): string;
	abort(requestId: string): void;
	resolveApproval(params: ServiceResolveApprovalParams): void;
	/** Push an orchestrator message into an active run (e.g. post-edit lint). */
	injectRunMessage(requestId: string, content: string): void;
	/** Restore files from a main-process checkpoint snapshot. */
	restoreCheckpoint(checkpointId: string, workspaceFolder: string): Promise<MainRestoreCheckpointResult>;
	getCheckpointSnapshot(checkpointId: string): Promise<MainGetCheckpointSnapshotResult>;
}

export class AgenticRuntimeService extends Disposable implements IAgenticRuntimeService {
	declare readonly _serviceBrand: undefined;
	private readonly channel: IChannel;

	private readonly hooks = {
		onEvent: {} as Record<string, (e: AgentEvent) => void>,
		onError: {} as Record<string, (p: { message: string; fullError: Error | null }) => void>,
	};

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super();
		this.channel = mainProcessService.getChannel(AGENTIC_CHANNEL_NAME);
		this._register((this.channel.listen('onAgentEvent') as Event<EventAgentEventParams>)(e => {
			this.hooks.onEvent[e.requestId]?.(e.event);
		}));
		this._register((this.channel.listen('onRunError') as Event<EventRunErrorParams>)(e => {
			this.hooks.onError[e.requestId]?.({ message: e.message, fullError: e.fullError ? new Error(e.fullError) : null });
			this._clearHooks(e.requestId);
		}));
	}

	startRun(params: ServiceStartRunParams): string {
		const requestId = generateUuid();
		this.hooks.onEvent[requestId] = params.onEvent;
		this.hooks.onError[requestId] = params.onError;
		const mainParams: MainStartRunParams = {
			requestId,
			request: params.request,
		};
		void this.channel.call('startRun', mainParams);
		return requestId;
	}

	abort(requestId: string): void {
		const p: MainAbortRunParams = { requestId };
		void this.channel.call('abortRun', p);
		this._clearHooks(requestId);
	}

	resolveApproval(params: ServiceResolveApprovalParams): void {
		this.hooks.onEvent[params.requestId] = params.onEvent;
		this.hooks.onError[params.requestId] = params.onError;
		const mainParams: MainResolveApprovalParams = {
			requestId: params.requestId,
			runId: params.runId,
			approvalId: params.approvalId,
			decision: params.decision,
		};
		void this.channel.call('resolveApproval', mainParams);
	}

	injectRunMessage(requestId: string, content: string): void {
		const mainParams: MainInjectRunMessageParams = { requestId, content };
		void this.channel.call('injectRunMessage', mainParams);
	}

	restoreCheckpoint(checkpointId: string, workspaceFolder: string): Promise<MainRestoreCheckpointResult> {
		const mainParams: MainRestoreCheckpointParams = { checkpointId, workspaceFolder };
		return this.channel.call('restoreCheckpoint', mainParams) as Promise<MainRestoreCheckpointResult>;
	}

	getCheckpointSnapshot(checkpointId: string): Promise<MainGetCheckpointSnapshotResult> {
		const mainParams: MainGetCheckpointSnapshotParams = { checkpointId };
		return this.channel.call('getCheckpointSnapshot', mainParams) as Promise<MainGetCheckpointSnapshotResult>;
	}

	private _clearHooks(requestId: string) {
		delete this.hooks.onEvent[requestId];
		delete this.hooks.onError[requestId];
	}
}

registerSingleton(IAgenticRuntimeService, AgenticRuntimeService, InstantiationType.Eager);
