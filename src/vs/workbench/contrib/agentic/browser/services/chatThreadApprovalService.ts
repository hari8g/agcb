/*--------------------------------------------------------------------------------------
 *  Agentic AI — edit approval preview / apply / cancel (extracted from chatThreadService)
 *--------------------------------------------------------------------------------------*/

import { validateSearchReplaceBlocks } from '../../common/editValidator.js';
import { coerceSearchReplaceBlocks, coerceWriteFileContent } from '../../common/writeFileContent.js';
import type {
	AgentEvent,
	ApprovalRequest,
	ChatMessage,
	ChatThread,
	TouchedFileStatus,
	ToolCall,
} from '../../common/agenticTypes.js';

export interface ChatThreadApprovalHost {
	readonly jiraWorkflowExecuting: boolean;

	recordTouchedFile(msg: ChatMessage, path: string, status: TouchedFileStatus): void;
	revealTouchedFileInEditor(path: string, mode: 'read' | 'preview' | 'applied', searchReplaceBlocks?: string): void;
	noteFileRevealed(msg: ChatMessage, path: string, verb: 'Opened' | 'Showing edits in' | 'Created'): void;
	runPostEditLintVerify(msg: ChatMessage, path: string, lintFromApply?: string): void;
	recordJiraFileChange(path: string, status: 'applied' | 'preview'): void;

	writeFile(path: string, content: string, msg: ChatMessage): void;
	finalizeProposeFileEdit(path: string, blocks: string, msg: ChatMessage): void;
	cancelProposeFileEdit(path: string): void;
	previewProposeFileEdit(path: string, preview: string): void;
}

export interface ChatThreadApprovalResolveHost extends ChatThreadApprovalHost {
	decideEditApproval(approvalId: string, decision: 'approved' | 'rejected'): void;
	reduceEvent(thread: ChatThread, assistantMsg: ChatMessage, event: AgentEvent): void;
	notify(): void;
}

export function toolCallForApproval(msg: ChatMessage, toolCallId: string): ToolCall | undefined {
	return msg.toolCalls?.find(t => t.id === toolCallId);
}

export function previewProposeEditTool(
	host: ChatThreadApprovalHost,
	msg: ChatMessage,
	toolName: string,
	args: Record<string, unknown>,
): void {
	if (toolName !== 'propose_file_edit') {
		return;
	}
	const path = String(args.path ?? '');
	const blocks = coerceSearchReplaceBlocks(args.searchReplaceBlocks);
	if (!validateSearchReplaceBlocks(blocks).ok) {
		return;
	}
	host.recordTouchedFile(msg, path, 'preview');
	if (host.jiraWorkflowExecuting) {
		host.recordJiraFileChange(path, 'preview');
	}
	host.revealTouchedFileInEditor(path, 'preview', blocks);
	host.noteFileRevealed(msg, path, 'Showing edits in');
}

export function previewProposeEditsForApproval(
	host: ChatThreadApprovalHost,
	msg: ChatMessage,
	ar: ApprovalRequest,
): void {
	const ids = ar.items?.length
		? ar.items.map(i => i.toolCallId)
		: [ar.toolCallId];
	for (const id of ids) {
		const tc = toolCallForApproval(msg, id);
		if (tc) {
			previewProposeEditTool(host, msg, tc.name, tc.arguments);
		} else if (ar.filePath && ar.preview) {
			host.recordTouchedFile(msg, ar.filePath, 'preview');
			host.revealTouchedFileInEditor(ar.filePath, 'preview', ar.preview);
			host.previewProposeFileEdit(ar.filePath, ar.preview);
		}
	}
}

export function finalizeProposeEditsForApproval(
	host: ChatThreadApprovalHost,
	msg: ChatMessage,
	ar?: ApprovalRequest,
): void {
	if (!ar) {
		return;
	}
	const ids = ar.items?.length
		? ar.items.map(i => i.toolCallId)
		: [ar.toolCallId];
	for (const id of ids) {
		const tc = toolCallForApproval(msg, id);
		if (tc?.name === 'write_file') {
			const path = String(tc.arguments.path ?? '');
			const content = coerceWriteFileContent(tc.arguments.content);
			if (!path || !content) {
				host.recordTouchedFile(msg, path, 'failed');
				continue;
			}
			host.recordTouchedFile(msg, path, 'applied');
			host.writeFile(path, content, msg);
			host.noteFileRevealed(msg, path, 'Created');
		} else if (tc?.name === 'propose_file_edit') {
			const path = String(tc.arguments.path ?? '');
			const blocks = coerceSearchReplaceBlocks(tc.arguments.searchReplaceBlocks);
			let validation = validateSearchReplaceBlocks(blocks);
			if (!validation.ok) {
				validation = validateSearchReplaceBlocks(blocks, { allowCreate: true });
			}
			if (!validation.ok) {
				host.recordTouchedFile(msg, path, 'failed');
				continue;
			}
			host.recordTouchedFile(msg, path, 'applied');
			host.finalizeProposeFileEdit(path, blocks, msg);
			host.noteFileRevealed(msg, path, 'Showing edits in');
		}
	}
}

export function cancelProposeEditsForApproval(
	host: ChatThreadApprovalHost,
	msg: ChatMessage,
	ar: ApprovalRequest,
): void {
	const ids = ar.items?.length
		? ar.items.map(i => i.toolCallId)
		: [ar.toolCallId];
	for (const id of ids) {
		const tc = toolCallForApproval(msg, id);
		if (tc?.name === 'propose_file_edit') {
			const path = String(tc.arguments.path ?? '');
			host.recordTouchedFile(msg, path, 'rejected');
			host.cancelProposeFileEdit(path);
		}
	}
}

export function resolveChatThreadApproval(
	host: ChatThreadApprovalResolveHost,
	params: {
		thread: ChatThread;
		approvalId: string;
		decision: 'approved' | 'rejected';
		activeRequestId: string;
		activeRunId: string;
		runtimeResolveApproval(opts: {
			requestId: string;
			runId: string;
			approvalId: string;
			decision: 'approved' | 'rejected';
			onEvent: (event: AgentEvent) => void;
			onError: (err: { message: string }) => void;
		}): void;
	},
): void {
	const { thread, approvalId, decision, activeRequestId, activeRunId } = params;

	const ar = thread.approvalRequests.find(a => a.id === approvalId);
	if (ar) {
		ar.decision = decision;
	}
	host.decideEditApproval(approvalId, decision);

	const assistantMsg = thread.messages.find(m => m.decision?.approvalId === approvalId)
		?? [...thread.messages].reverse().find(m => m.role === 'assistant');
	if (assistantMsg?.decision) {
		assistantMsg.decision = { ...assistantMsg.decision, resolved: true };
	}
	if (!assistantMsg) {
		return;
	}

	if (decision === 'approved') {
		finalizeProposeEditsForApproval(host, assistantMsg, ar);
	} else if (ar) {
		cancelProposeEditsForApproval(host, assistantMsg, ar);
	}

	params.runtimeResolveApproval({
		requestId: activeRequestId,
		runId: activeRunId,
		approvalId,
		decision,
		onEvent: event => host.reduceEvent(thread, assistantMsg, event),
		onError: ({ message }) => {
			assistantMsg.state = 'error';
			assistantMsg.content = message;
			host.notify();
		},
	});
}
