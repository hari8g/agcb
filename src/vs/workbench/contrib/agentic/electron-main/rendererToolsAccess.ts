/*--------------------------------------------------------------------------------------
 *  Agentic AI — call workbench renderer tools from electron-main
 *--------------------------------------------------------------------------------------*/

import type { IChannel, IPCServer, StaticRouter } from '../../../../base/parts/ipc/common/ipc.js';
import { AGENTIC_RENDERER_TOOLS_CHANNEL } from '../common/agenticProtocol.js';

let ipcServer: IPCServer | undefined;
let router: StaticRouter | undefined;

export function initAgenticRendererToolsAccess(server: IPCServer, staticRouter: StaticRouter): void {
	ipcServer = server;
	router = staticRouter;
}

function getChannel(): IChannel | undefined {
	if (!ipcServer || !router) {
		return undefined;
	}
	try {
		return ipcServer.getChannel(AGENTIC_RENDERER_TOOLS_CHANNEL, router);
	} catch {
		return undefined;
	}
}

export async function readLintErrorsViaRenderer(filePath: string): Promise<string> {
	const channel = getChannel();
	if (!channel) {
		return 'Lint check unavailable (workbench not ready).';
	}
	try {
		return await channel.call('readLintErrors', { path: filePath }) as string;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}
