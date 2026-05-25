/*--------------------------------------------------------------------------------------
 *  Agentic AI — bridge DI services to React hooks
 *--------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { IAgenticChatThreadService } from '../../../services/chatThreadService.js';
import { IJiraWorkflowService } from '../../../services/jiraWorkflowServiceInterface.js';
import { IKnowledgeGraphService } from '../../../services/knowledgeGraphService.js';
import { IAgentMetricsService } from '../../../services/agentMetricsService.js';
import { ISessionMemoryService } from '../../../services/sessionMemoryService.js';
import type { ChatThread, LiveAgentStatus } from '../../../../common/agenticTypes.js';
import type { InteractiveJiraWorkflowState } from '../agentic-bundle-types.js';
import type { TemporalKnowledgeGraph } from '../../../../common/codebaseKnowledgeGraph.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IEditApprovalService } from '../../../services/editApprovalService.js';
import { IAgenticSettingsService } from '../../../services/agenticSettingsService.js';
import { IVoidSettingsService } from '../../../../../void/common/voidSettingsService.js';
import type { ModelSelection } from '../../../../../void/common/voidSettingsTypes.js';
import type { ApprovalRequest } from '../../../../common/agenticTypes.js';
import type { ComposerAgentModeId } from '../../../../common/agentModes.js';

let threadsState: { threads: ChatThread[]; currentThreadId: string | null } = { threads: [], currentThreadId: null };
const threadsListeners = new Set<() => void>();

let pendingApprovals: ApprovalRequest[] = [];
const approvalListeners = new Set<() => void>();

let workspaceLabel = '';
let hasWorkspace = false;
const workspaceListeners = new Set<() => void>();

let knowledgeGraphState: {
	graph: TemporalKnowledgeGraph | null;
	loading: boolean;
	error: string | null;
} = { graph: null, loading: false, error: null };
const knowledgeGraphListeners = new Set<() => void>();

export type VoidChatModelOption = {
	label: string;
	providerName: string;
	modelName: string;
};

let voidChatModels: VoidChatModelOption[] = [];
let voidChatModelSelection: ModelSelection | null = null;
const voidChatModelListeners = new Set<() => void>();

let liveStatus: LiveAgentStatus | null = null;
const liveStatusListeners = new Set<() => void>();

/** Service instances resolved once at mount — do not keep ServicesAccessor for React renders. */
type AgenticReactServices = {
	chatThreadService: IAgenticChatThreadService;
	editApprovalService: IEditApprovalService;
	agenticSettingsService: IAgenticSettingsService;
	jiraWorkflowService: IJiraWorkflowService;
	knowledgeGraphService: IKnowledgeGraphService;
	voidSettingsService: IVoidSettingsService;
};

let services_: AgenticReactServices | null = null;
let agentMetricsService_: IAgentMetricsService | null = null;
let sessionMemoryService_: ISessionMemoryService | null = null;

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

export function getKnowledgeGraphService(): IKnowledgeGraphService {
	return requireServices().knowledgeGraphService;
}

export function getAgentMetricsService(): IAgentMetricsService {
	if (!agentMetricsService_) {
		throw new Error('Agentic metrics not initialized — open the Agentic AI panel after app startup');
	}
	return agentMetricsService_;
}

export function getSessionMemoryService(): ISessionMemoryService {
	if (!sessionMemoryService_) {
		throw new Error('Agentic session memory not initialized — open the Agentic AI panel after app startup');
	}
	return sessionMemoryService_;
}

function syncVoidChatModels(voidSettings: IVoidSettingsService): void {
	const state = voidSettings.state;
	voidChatModelSelection = state.modelSelectionOfFeature.Chat;
	voidChatModels = state._modelOptions.map(o => ({
		label: o.selection.modelName,
		providerName: o.selection.providerName,
		modelName: o.selection.modelName,
	}));
	voidChatModelListeners.forEach(l => l());
}

export function setVoidChatModel(providerName: string, modelName: string): void {
	requireServices().voidSettingsService.setModelSelectionOfFeature('Chat', { providerName, modelName });
}

function updateWorkspaceLabel(workspace: IWorkspaceContextService) {
	const ws = workspace.getWorkspace();
	hasWorkspace = ws.folders.length > 0;
	workspaceLabel = ws.folders.map(f => f.name).join(', ') || 'No folder open';
	workspaceListeners.forEach(l => l());
}

async function refreshKnowledgeGraphState(kgSvc: IKnowledgeGraphService, loading = false): Promise<void> {
	if (!hasWorkspace) {
		knowledgeGraphState = { graph: null, loading: false, error: null };
		knowledgeGraphListeners.forEach(l => l());
		return;
	}
	knowledgeGraphState = { ...knowledgeGraphState, loading, error: null };
	knowledgeGraphListeners.forEach(l => l());
	try {
		const graph = loading
			? await kgSvc.getOrBuild('', { forceRefresh: true })
			: (kgSvc.getCached() ?? await kgSvc.ensureLoaded());
		knowledgeGraphState = { graph, loading: false, error: null };
	} catch (e) {
		knowledgeGraphState = {
			graph: kgSvc.getCached(),
			loading: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
	knowledgeGraphListeners.forEach(l => l());
}

let agenticServicesRegisterCount = 0;
let agenticServicesListenerStore: DisposableStore | null = null;

export function _registerAgenticServices(accessor: ServicesAccessor): IDisposable[] {
	agenticServicesRegisterCount++;

	if (!agenticServicesListenerStore) {
		const store = new DisposableStore();
		agenticServicesListenerStore = store;

		const chat = accessor.get(IAgenticChatThreadService);
		const workspace = accessor.get(IWorkspaceContextService);
		const approvals = accessor.get(IEditApprovalService);
		const settings = accessor.get(IAgenticSettingsService);
		const jiraWorkflow = accessor.get(IJiraWorkflowService);
		const knowledgeGraph = accessor.get(IKnowledgeGraphService);
		const voidSettings = accessor.get(IVoidSettingsService);
		agentMetricsService_ = accessor.get(IAgentMetricsService);
		sessionMemoryService_ = accessor.get(ISessionMemoryService);

		services_ = {
			chatThreadService: chat,
			editApprovalService: approvals,
			agenticSettingsService: settings,
			jiraWorkflowService: jiraWorkflow,
			knowledgeGraphService: knowledgeGraph,
			voidSettingsService: voidSettings,
		};

		syncVoidChatModels(voidSettings);
		store.add(voidSettings.onDidChangeState(() => syncVoidChatModels(voidSettings)));

		threadsState = chat.state;
		threadsListeners.forEach(l => l());
		liveStatus = chat.getLiveStatus();
		liveStatusListeners.forEach(l => l());

		updateWorkspaceLabel(workspace);

		store.add(chat.onDidChange(() => {
			threadsState = chat.state;
			liveStatus = chat.getLiveStatus();
			threadsListeners.forEach(l => l());
			liveStatusListeners.forEach(l => l());
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
			void refreshKnowledgeGraphState(knowledgeGraph);
		}));
		store.add(knowledgeGraph.onDidChange(() => {
			knowledgeGraphState = {
				graph: knowledgeGraph.getCached(),
				loading: false,
				error: null,
			};
			knowledgeGraphListeners.forEach(l => l());
		}));
		void refreshKnowledgeGraphState(knowledgeGraph);
	}

	return [{
		dispose: () => {
			agenticServicesRegisterCount--;
			if (agenticServicesRegisterCount <= 0) {
				agenticServicesRegisterCount = 0;
				agenticServicesListenerStore?.dispose();
				agenticServicesListenerStore = null;
				services_ = null;
			}
		},
	}];
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

export function useHasWorkspace(): boolean {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		workspaceListeners.add(l);
		return () => { workspaceListeners.delete(l); };
	}, []);
	return hasWorkspace;
}

export function useKnowledgeGraph() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		knowledgeGraphListeners.add(l);
		return () => { knowledgeGraphListeners.delete(l); };
	}, []);
	return knowledgeGraphState;
}

export function useVoidChatModels(): {
	models: VoidChatModelOption[];
	selection: ModelSelection | null;
} {
	const [, setTick] = useState(0);
	useEffect(() => {
		const l = () => setTick(t => t + 1);
		voidChatModelListeners.add(l);
		return () => { voidChatModelListeners.delete(l); };
	}, []);
	return { models: voidChatModels, selection: voidChatModelSelection };
}

export type { ComposerAgentModeId };

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
