/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { URI } from '../../../../../../../base/common/uri.js';
import { Check, X, Layers, Play, Users } from 'lucide-react';
import '../styles.css';
import { useAccessor, useCommandBarState, useChatThreadsState, useChatThreadsStreamState, useIsDark } from '../util/services.js';
import { VoidInputBox2, TextAreaFns } from '../util/inputs.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { getBasename, voidOpenFileFn } from '../sidebar-tsx/SidebarChat.js';

const FileChangeRow = ({ uri }: { uri: URI }) => {
	const accessor = useAccessor();
	const editCodeService = accessor.get('IEditCodeService');
	const { stateOfURI } = useCommandBarState();
	const st = stateOfURI[uri.fsPath];
	const numDiffs = st?.sortedDiffIds?.length ?? 0;
	const isStreaming = st?.isStreaming;

	return (
		<div className='flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-void-bg-3 text-sm'>
			<button
				type='button'
				className='truncate text-left text-void-fg-1 flex-1'
				onClick={() => voidOpenFileFn(uri, accessor)}
			>
				{getBasename(uri.fsPath)}
				{isStreaming ? <span className='text-void-fg-3 ml-1'>· streaming</span> : null}
				{numDiffs > 0 ? <span className='text-void-fg-3 ml-1'>({numDiffs} change{numDiffs === 1 ? '' : 's'})</span> : null}
			</button>
			<div className='flex gap-1 shrink-0'>
				<button
					type='button'
					className='p-1 rounded hover:bg-void-bg-2 text-void-fg-3'
					title='Reject file'
					onClick={() => editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: 'reject' })}
				>
					<X size={14} />
				</button>
				<button
					type='button'
					className='p-1 rounded hover:bg-void-bg-2 text-green-400'
					title='Accept file'
					onClick={() => editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: 'accept' })}
				>
					<Check size={14} />
				</button>
			</div>
		</div>
	);
};

export const ComposerPanel = () => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const editCodeService = accessor.get('IEditCodeService');
	const chatThreadsService = accessor.get('IChatThreadService');
	const subagentService = accessor.get('ISubagentService');
	const { sortedURIs } = useCommandBarState();
	const chatThreadsState = useChatThreadsState();
	const streamState = useChatThreadsStreamState(chatThreadsState.currentThreadId);
	const isRunning = !!streamState?.isRunning;

	const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
	const textAreaFnsRef = useRef<TextAreaFns | null>(null);
	const [subagentPrompts, setSubagentPrompts] = useState('');
	const [, forceUpdate] = useState(0);

	useEffect(() => {
		const d = subagentService.onDidChangeTasks(() => forceUpdate(n => n + 1));
		return () => d.dispose();
	}, [subagentService]);

	const onSubmit = useCallback(async () => {
		const userMessage = textAreaRef.current?.value?.trim() ?? '';
		if (!userMessage || isRunning) return;
		await chatThreadsService.addUserMessageAndStreamResponse({
			threadId: chatThreadsState.currentThreadId,
			userMessage,
		});
		textAreaFnsRef.current?.setValue('');
	}, [chatThreadsService, chatThreadsState.currentThreadId, isRunning]);

	const runSubagents = useCallback(() => {
		const prompts = subagentPrompts.split('\n').map(s => s.trim()).filter(Boolean);
		if (prompts.length === 0) return;
		void subagentService.runParallelSubagents(chatThreadsState.currentThreadId, prompts);
	}, [subagentPrompts, subagentService, chatThreadsState.currentThreadId]);

	const acceptAll = () => {
		sortedURIs.forEach(uri => editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: 'accept' }));
	};
	const rejectAll = () => {
		sortedURIs.forEach(uri => editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: 'reject' }));
	};

	const subagentTasks = subagentService.getTasks();

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''} w-full h-full flex flex-col bg-void-bg-2 text-void-fg-1`}>
			<div className='px-3 py-2 border-b border-void-border-2 flex items-center gap-2'>
				<Layers size={16} className='text-void-fg-3' />
				<span className='font-medium text-sm'>Composer</span>
				<span className='text-xs text-void-fg-3 ml-auto'>{sortedURIs.length} file{sortedURIs.length === 1 ? '' : 's'}</span>
			</div>

			<div className='flex-1 overflow-auto min-h-0 flex flex-col'>
				<div className='p-2 border-b border-void-border-2'>
					<div className='text-xs text-void-fg-3 mb-2 uppercase tracking-wide'>Changed files</div>
					{sortedURIs.length === 0 ? (
						<div className='text-sm text-void-fg-3 px-2 py-4'>No pending edits. Agent changes appear here with green highlights in the editor.</div>
					) : (
						<>
							<div className='flex gap-2 mb-2'>
								<button type='button' onClick={acceptAll} className='text-xs px-2 py-1 rounded bg-green-900/40 text-green-300 hover:bg-green-900/60'>Accept all</button>
								<button type='button' onClick={rejectAll} className='text-xs px-2 py-1 rounded bg-red-900/30 text-red-300 hover:bg-red-900/50'>Reject all</button>
							</div>
							{sortedURIs.map(uri => (
								<FileChangeRow key={uri.fsPath} uri={uri} />
							))}
						</>
					)}
				</div>

				<div className='p-2 border-b border-void-border-2'>
					<div className='text-xs text-void-fg-3 mb-2 uppercase tracking-wide flex items-center gap-1'>
						<Users size={12} /> Parallel subagents
					</div>
					<textarea
						className='w-full text-xs bg-void-bg-3 rounded p-2 min-h-[60px] text-void-fg-1 border border-void-border-2'
						placeholder='One task per line — runs in parallel, then merges into this thread'
						value={subagentPrompts}
						onChange={e => setSubagentPrompts(e.target.value)}
					/>
					<button
						type='button'
						onClick={runSubagents}
						className='mt-2 text-xs px-3 py-1.5 rounded bg-void-bg-3 hover:bg-void-bg-4 flex items-center gap-1'
					>
						<Play size={12} /> Run subagents
					</button>
					{subagentTasks.length > 0 && (
						<ul className='mt-2 space-y-1 text-xs'>
							{subagentTasks.map(t => (
								<li key={t.id} className='text-void-fg-3 truncate'>
									<span className={t.status === 'running' ? 'text-orange-400' : t.status === 'done' ? 'text-green-400' : ''}>{t.status}</span>
									{' — '}{t.prompt.slice(0, 60)}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			<div className='p-2 border-t border-void-border-2'>
				<ErrorBoundary>
					<VoidInputBox2
						enableAtToMention
						multiline
						placeholder='Multi-file instruction for agent… (Ctrl+Shift+I to open Composer)'
						fnsRef={textAreaFnsRef}
						ref={textAreaRef}
						onKeyDown={e => {
							if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
								e.preventDefault();
								void onSubmit();
							}
						}}
					/>
				</ErrorBoundary>
			</div>
		</div>
	);
};
