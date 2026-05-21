/*--------------------------------------------------------------------------------------
 *  Agentic AI — checkpoint types
 *--------------------------------------------------------------------------------------*/

export interface CheckpointSnapshot {
	checkpointId: string;
	files: { path: string; content: string }[];
	createdAt: number;
}

export interface CreateCheckpointParams {
	label: string;
	paths?: string[];
}

export interface RestoreCheckpointParams {
	checkpointId: string;
}
