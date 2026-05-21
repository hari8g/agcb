/*--------------------------------------------------------------------------------------
 *  Agentic AI — terminal tools (electron-main) — requires approval before run
 *--------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runTerminalCommandTool(
	cwd: string,
	command: string,
	timeoutMs = 60_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	try {
		const { stdout, stderr } = await execAsync(command, {
			cwd,
			timeout: timeoutMs,
			maxBuffer: 1024 * 1024,
		});
		return { stdout, stderr, exitCode: 0 };
	} catch (e: unknown) {
		const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
		return {
			stdout: err.stdout ?? '',
			stderr: err.stderr ?? err.message ?? String(e),
			exitCode: typeof err.code === 'number' ? err.code : 1,
		};
	}
}
