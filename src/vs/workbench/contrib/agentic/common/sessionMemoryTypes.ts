/*--------------------------------------------------------------------------------------
 *  Agentic AI — session / project memory (persistent per workspace)
 *--------------------------------------------------------------------------------------*/

export type MemoryFactKind =
	| 'user_preference'
	| 'project_convention'
	| 'stack'
	| 'target_hint'
	| 'workflow';

export interface MemoryFact {
	id: string;
	kind: MemoryFactKind;
	text: string;
	/** Higher = more important in prompt */
	weight: number;
	updatedAt: number;
	source: 'user' | 'inferred' | 'project_scan';
}

export interface ProjectModel {
	workspaceKey: string;
	facts: MemoryFact[];
	/** package manager, primary language, etc. */
	tags: string[];
	updatedAt: number;
}

export interface UserSessionMemory {
	workspaceKey: string;
	facts: MemoryFact[];
	updatedAt: number;
}

export interface SessionMemorySnapshot {
	project: ProjectModel;
	user: UserSessionMemory;
}

export interface RunMemoryInput {
	userMessage: string;
	intent?: string;
	targetPaths?: string[];
	toolNames?: string[];
	successfulEditPaths?: string[];
}
