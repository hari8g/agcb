/*--------------------------------------------------------------------------------------
 *  Agentic AI — register Void MCPChannel for main-process tool execution
 *--------------------------------------------------------------------------------------*/

import type { MCPToolCallParams, RawMCPToolCall } from '../../../void/common/mcpServiceTypes.js';

export interface IMcpChannelLike {
	call(_: unknown, command: string, params: unknown): Promise<unknown>;
}

let _channel: IMcpChannelLike | undefined;

export function registerAgenticMcpChannel(channel: IMcpChannelLike): void {
	_channel = channel;
}

export function getAgenticMcpChannel(): IMcpChannelLike | undefined {
	return _channel;
}

export async function agenticCallMcpTool(params: MCPToolCallParams): Promise<RawMCPToolCall> {
	if (!_channel) {
		throw new Error('MCP channel is not registered. Ensure Agentic_MPS MCP servers are configured in ~/.void-editor/mcp.json');
	}
	const result = await _channel.call(null, 'callTool', params);
	return result as RawMCPToolCall;
}
