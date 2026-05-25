/*--------------------------------------------------------------------------------------
 *  Agentic AI — plan-only stall detection (re-exports progressive orchestration)
 *--------------------------------------------------------------------------------------*/

export {
	isActionableAgentTask,
	isCodingTask,
	detectPlanOnlyStall,
	detectNonToolProgress,
	mustNotCompleteWithoutTools,
	buildPlanContinuationNudge,
	buildEscalatingNudge,
	planStallUserMessage,
	shouldNudgePlanContinuation,
	shouldBootstrapProgress,
	pickBootstrapTool,
	bootstrapActivityLine,
	DEFAULT_ORCHESTRATOR_MAX_NUDGES,
	DEFAULT_ORCHESTRATOR_BOOTSTRAP_TURNS,
} from './agentOrchestration.js';
