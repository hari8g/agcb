import React from 'react';
import type { Checkpoint } from '../../../../common/agenticTypes.js';

export function CheckpointBanner({ checkpoints }: { checkpoints: Checkpoint[] }) {
	const latest = checkpoints[checkpoints.length - 1];
	if (!latest) return null;
	return (
		<div className="agentic-checkpoint">
			Checkpoint: {latest.label} ({new Date(latest.createdAt).toLocaleTimeString()})
		</div>
	);
}
