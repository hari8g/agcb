/*--------------------------------------------------------------------------------------
 *  Agentic AI — persist JIRA workflow checkpoints (workspace storage)
 *--------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { JiraWorkflowCheckpoint } from '../../common/mcp/jiraWorkflowTypes.js';

const STORAGE_KEY = 'agentic.jiraWorkflow.checkpoints.v1';

export class JiraWorkflowCheckpointStore {
	constructor(private readonly storageService: IStorageService) {}

	loadAll(): JiraWorkflowCheckpoint[] {
		try {
			const raw = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE, '[]');
			const parsed = JSON.parse(raw) as JiraWorkflowCheckpoint[];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	saveAll(checkpoints: JiraWorkflowCheckpoint[]): void {
		this.storageService.store(
			STORAGE_KEY,
			JSON.stringify(checkpoints.slice(-100)),
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
	}

	append(cp: JiraWorkflowCheckpoint): JiraWorkflowCheckpoint[] {
		const all = [...this.loadAll(), cp];
		this.saveAll(all);
		return all;
	}
}
