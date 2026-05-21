/*--------------------------------------------------------------------------------------
 *  Agentic AI — edit approval state (browser)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import type { ApprovalRequest, ApprovalDecision } from '../../common/agenticTypes.js';

export const IEditApprovalService = createDecorator<IEditApprovalService>('agenticEditApprovalService');

export interface IEditApprovalService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: import('../../../../../base/common/event.js').Event<void>;
	getPending(): ApprovalRequest[];
	setPending(requests: ApprovalRequest[]): void;
	decide(approvalId: string, decision: ApprovalDecision): void;
}

class EditApprovalService extends Disposable implements IEditApprovalService {
	declare readonly _serviceBrand: undefined;
	private _pending: ApprovalRequest[] = [];
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	getPending(): ApprovalRequest[] {
		return [...this._pending];
	}

	setPending(requests: ApprovalRequest[]): void {
		this._pending = requests;
		this._onDidChange.fire();
	}

	decide(approvalId: string, decision: ApprovalDecision): void {
		const item = this._pending.find(p => p.id === approvalId);
		if (item) item.decision = decision;
		this._onDidChange.fire();
	}
}

registerSingleton(IEditApprovalService, EditApprovalService, InstantiationType.Delayed);
