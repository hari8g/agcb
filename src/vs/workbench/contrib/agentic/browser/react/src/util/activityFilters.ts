import type { ActivityLine } from '../../../../common/agenticTypes.js';

/** Show orchestrator, verify, and lint lines; hide noisy turn narration. */
export function shouldShowActivityLine(line: ActivityLine): boolean {
	if (line.kind === 'orchestrator') {
		return /plan:|impact:|verify|lint|checkpoint|restored|format reminder/i.test(line.text);
	}
	if (line.kind === 'reasoning') {
		return false;
	}
	return false;
}
