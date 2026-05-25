/*--------------------------------------------------------------------------------------
 *  Agentic AI — terminal command safety (destructive blocklist)
 *--------------------------------------------------------------------------------------*/

export interface TerminalSafetyResult {
	allowed: boolean;
	reason?: string;
}

const DESTRUCTIVE_PATTERNS: { pattern: RegExp; reason: string }[] = [
	{ pattern: /\brm\s+-rf\b/i, reason: 'recursive force delete' },
	{ pattern: /\brm\s+-r\s+-f\b/i, reason: 'recursive force delete' },
	{ pattern: /\bsudo\s+rm\b/i, reason: 'privileged delete' },
	{ pattern: /\bgit\s+push\s+.*--force\b/i, reason: 'force push' },
	{ pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'hard git reset' },
	{ pattern: /\bgit\s+clean\s+-fdx\b/i, reason: 'destructive git clean' },
	{ pattern: /\bDROP\s+DATABASE\b/i, reason: 'drop database' },
	{ pattern: /\bDROP\s+TABLE\b/i, reason: 'drop table' },
	{ pattern: /\bmkfs\b/i, reason: 'format filesystem' },
	{ pattern: /\bdd\s+if=/i, reason: 'raw disk write' },
	{ pattern: />\s*\/dev\/sd[a-z]/i, reason: 'write to block device' },
	{ pattern: /\bchmod\s+-R\s+777\b/i, reason: 'insecure permissions' },
	{ pattern: /\bcurl\s+.*\|\s*(ba)?sh\b/i, reason: 'pipe remote script to shell' },
	{ pattern: /\bwget\s+.*\|\s*(ba)?sh\b/i, reason: 'pipe remote script to shell' },
];

export function checkTerminalCommandSafety(command: string): TerminalSafetyResult {
	const trimmed = command.trim();
	if (!trimmed) {
		return { allowed: false, reason: 'Empty command' };
	}
	for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
		if (pattern.test(trimmed)) {
			return {
				allowed: false,
				reason: `Blocked unsafe terminal command (${reason})`,
			};
		}
	}
	return { allowed: true };
}
