/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Emitter } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatThreadService } from './chatThreadService.js';

export type SubagentTaskStatus = 'pending' | 'running' | 'done' | 'error';

export type SubagentTask = {
	id: string;
	prompt: string;
	status: SubagentTaskStatus;
	threadId: string | null;
	summary: string | null;
};

export const ISubagentService = createDecorator<ISubagentService>('subagentService');

export interface ISubagentService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeTasks: import('../../../../base/common/event.js').Event<void>;
	getTasks(): SubagentTask[];
	runParallelSubagents(parentThreadId: string, prompts: string[]): Promise<void>;
	cancelAll(): void;
}

class SubagentService extends Disposable implements ISubagentService {
	_serviceBrand: undefined;

	private _tasks: SubagentTask[] = [];
	private readonly _onDidChangeTasks = this._register(new Emitter<void>());
	readonly onDidChangeTasks = this._onDidChangeTasks.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	private _chatThreads(): IChatThreadService {
		return this._instantiationService.invokeFunction(accessor => accessor.get(IChatThreadService));
	}

	getTasks(): SubagentTask[] {
		return [...this._tasks];
	}

	cancelAll(): void {
		for (const t of this._tasks) {
			if (t.threadId) this._chatThreads().abortRunning(t.threadId);
		}
		this._tasks = [];
		this._onDidChangeTasks.fire();
	}

	async runParallelSubagents(parentThreadId: string, prompts: string[]): Promise<void> {
		if (prompts.length === 0) return;

		this._tasks = prompts.map((prompt, i) => ({
			id: `subagent-${Date.now()}-${i}`,
			prompt,
			status: 'pending' as const,
			threadId: null,
			summary: null,
		}));
		this._onDidChangeTasks.fire();

		await Promise.all(this._tasks.map(async (task) => {
			task.status = 'running';
			this._onDidChangeTasks.fire();

			const threadId = this._chatThreads().createSubagentThread();
			task.threadId = threadId;
			this._onDidChangeTasks.fire();

			try {
				await this._chatThreads().addUserMessageAndStreamResponse({
					threadId,
					userMessage: task.prompt,
				});

				const thread = this._chatThreads().state.allThreads[threadId];
				const lastAssistant = [...(thread?.messages ?? [])].reverse().find(m => m.role === 'assistant');
				task.summary = lastAssistant && 'displayContent' in lastAssistant
					? lastAssistant.displayContent.slice(0, 2000)
					: '(completed)';
				task.status = 'done';
			} catch (e) {
				task.status = 'error';
				task.summary = String(e);
			}
			this._onDidChangeTasks.fire();
		}));

		const summaries = this._tasks
			.map((t, i) => `### Subagent ${i + 1}\n**Task:** ${t.prompt}\n**Result:** ${t.summary ?? '(none)'}`)
			.join('\n\n');

		await this._chatThreads().addUserMessageAndStreamResponse({
			threadId: parentThreadId,
			userMessage: `Parallel subagents finished. Merge these results and continue the main task if needed:\n\n${summaries}`,
		});
	}
}

registerSingleton(ISubagentService, SubagentService, InstantiationType.Delayed);
