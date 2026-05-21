/*--------------------------------------------------------------------------------------
 *  Agentic AI — bridge DI services to React hooks
 *--------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { IAgenticChatThreadService } from '../../../services/chatThreadService.js';
import { IJiraWorkflowService } from '../../../services/jiraWorkflowServiceInterface.js';
import type { ChatThread, LiveAgentStatus } from '../../../../common/agenticTypes.js';
import type { InteractiveJiraWorkflowState } from '../../../../common/mcp/jiraWorkflowTypes.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IEditApprovalService } from '../../../services/editApprovalService.js';
import { IAgenticSettingsService } from '../../../services/agenticSettingsService.js';
import type { ApprovalRequest } from '../../../../common/agenticTypes.js';

let threadsState: { threads: ChatThread[]; currentThreadId: string | null } = { threads: [], currentThreadId: null };
const threadsListeners = new Set<() => void>();

let pendingApprovals: ApprovalRequest[] = [];
const approvalListeners = new Set<() => void>();

let workspaceLabel = '';
const workspaceListeners = new Set<() => void>();

let liveStatus: LiveAgentStatus | null = null;
const liveStatusListeners = new Set<() => void>();

/** Service instances resolved once at mount — do not keep ServicesAccessor for React renders. */
type AgenticReactServices = {
	chatThreadService: IAgenticChatThreadService;
	editApprovalService: IEditApprovalService;
	agenticSettingsService: IAgenticSettingsService;
	jiraWorkflowService: IJiraWorkflowService;
};

let services_: AgenticReactServices | null = null;

function requireServices(): AgenticReactServices {
	if (!services_) {
		throw new Error('Agentic services not initialized — open the Agentic AI panel after app startup');
	}
	return services_;
}

export function getChatService(): IAgenticChatThreadService {
	return requireServices().chatThreadService;
}

export function getAgenticSettingsService(): IAgenticSettingsService {
	return requireServices().agenticSettingsService;
}

export function getJiraWorkflowService(): IJiraWorkflowService {
	return requireServices().jiraWorkflowService;
}

function updateWorkspaceLabel(workspace: IWorkspaceContextService) {
	const ws = workspace.getWorkspace();
	workspaceLabel = ws.folders.map(f => f.name).join(', ') || 'No folder open';
	workspaceListeners.forEach(l => l());
}

export function _registerAgenticServices(accessor: ServicesAccessor): IDisposable[] {
	const store = new DisposableStore();

	const chat = accessor.get(IAgenticChatThreadService);
	const workspace = accessor.get(IWorkspaceContextService);
	const approvals = accessor.get(IEditApprovalService);
	const settings = accessor.get(IAgenticSettingsService);
	const jiraWorkflow = accessor.get(IJiraWorkflowService);

	services_ = {
		chatThreadService: chat,
		editApprovalService: approvals,
		agenticSettingsService: settings,
		jiraWorkflowService: jiraWorkflow,
	};

	threadsState = chat.state;
	threadsListeners.forEach(l => l());
	liveStatus = chat.getLiveStatus();
	liveStatusListeners.forEach(l => l());

	updateWorkspaceLabel(workspace);

	store.add(chat.onDidChange(() => {
		threadsState = chat.state;
		threadsListeners.forEach(l => l());
	}));
	store.add(chat.onDidLiveStatusChange((s) => {
		liveStatus = s;
		liveStatusListeners.forEach(l => l());
	}));
	store.add(approvals.onDidChange(() => {
		pendingApprovals = approvals.getPending();
		approvalListeners.forEach(l => l());
	}));
	store.add(workspace.onDidChangeWorkspaceFolders(() => {
		updateWorkspaceLabel(workspace);
	}));

	store.add({
		dispose: () => {
			services_ = null;
		},
	});

	return [store];
}

export function useLiveAgentStatus() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		liveStatusListeners.add(l);
		return () => { liveStatusListeners.delete(l); };
	}, []);
	return liveStatus;
}

export function useAgenticThreads() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		threadsListeners.add(l);
		return () => { threadsListeners.delete(l); };
	}, []);
	return threadsState;
}

export function useWorkspaceLabel() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		workspaceListeners.add(l);
		return () => { workspaceListeners.delete(l); };
	}, []);
	return workspaceLabel;
}

export function usePendingApprovals() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		approvalListeners.add(l);
		return () => { approvalListeners.delete(l); };
	}, []);
	return pendingApprovals;
}

export function useAgenticSettings() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const svc = getAgenticSettingsService();
		const l = () => setTick(t => t + 1);
		const d = svc.onDidChange(l);
		return () => d.dispose();
	}, []);
	return getAgenticSettingsService().settings;
}

export function useJiraMcpStatus() {
	const [status, setStatus] = useState('Checking JIRA MCP…');
	useEffect(() => {
		let cancelled = false;
		const refresh = () => {
			void getChatService().getJiraMcpStatusSummary().then(s => {
				if (!cancelled) setStatus(s);
			});
		};
		refresh();
		const id = window.setInterval(refresh, 5000);
		return () => {
			cancelled = true;
			window.clearInterval(id);
		};
	}, []);
	return status;
}

export function useInteractiveJiraWorkflow(): InteractiveJiraWorkflowState {
	const [, setTick] = useState(0);
	useEffect(() => {
		const jira = getJiraWorkflowService();
		const l = () => setTick(t => t + 1);
		const d1 = jira.onDidChange(l);
		const d2 = jira.onDidEmitEvent(l);
		return () => {
			d1.dispose();
			d2.dispose();
		};
	}, []);
	return getJiraWorkflowService().interactive;
}
