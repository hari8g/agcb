/*--------------------------------------------------------------------------------------
 *  Agentic AI — runtime gateway types (local + external)
 *--------------------------------------------------------------------------------------*/

export type AgentRuntimeMode = 'local_provider' | 'external_agent_runtime';

export interface AgentRuntimeConfig {
	mode: AgentRuntimeMode;
	model: string;
	temperature: number;
	maxTokens: number;
	/** External gateway base URL when mode is external_agent_runtime */
	externalGatewayUrl?: string;
	/** OpenAI-compatible base URL for local_provider */
	baseUrl?: string;
}

export interface ExternalRuntimeRunRequest {
	runId: string;
	sessionId: string;
	payload: unknown;
}

export interface ExternalRuntimeRunResponse {
	runId: string;
	status: 'accepted' | 'rejected';
}
