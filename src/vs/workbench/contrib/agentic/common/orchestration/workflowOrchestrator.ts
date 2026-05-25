/*--------------------------------------------------------------------------------------
 *  Agentic AI — workflow orchestrator facade (additive layer over existing preflight)
 *--------------------------------------------------------------------------------------*/

import type { AgenticSettings } from '../agenticSettingsTypes.js';
import type { ResolvedAgentCapabilities } from '../agentCapabilities.js';
import type { CodebaseContext } from '../contextTypes.js';
import type { TemporalKnowledgeGraph } from '../codebaseKnowledgeGraph.js';
import type { AgentPipelineStrategy } from '../agentPipeline.js';
import {
	buildWorkflowArtifacts,
	runWorkflowPreflight,
	refineIntentAfterContext,
	type AgentWorkflowSnapshot,
} from '../agentWorkflowOrchestration.js';
import { buildIntentSystemBlock } from '../agentIntentClassifier.js';
import { buildToolRouterSystemBlock } from '../agentEditPipeline.js';
import { classifyStructuredIntent, buildStructuredIntentPromptBlock, type StructuredIntent } from './structuredIntent.js';
import { buildIntentToolRouterPromptBlock } from './intentToolRouter.js';
import { buildWorkflowRunPlan, buildWorkflowRunPlanPromptBlock, type WorkflowRunPlan } from './workflowRunPlanner.js';
import { resolveApprovalGate } from './approvalGatePolicy.js';
import {
	buildContextCollectionPlan,
	buildContextStrategyPromptBlock,
	type ContextCollectionPlan,
} from './contextStrategy.js';
import { selectCanonicalPhases } from './workflowPhases.js';

export interface OrchestrationPreflightInput {
	runId: string;
	userMessage: string;
	planOnlyMode: boolean;
	executeApproved: boolean;
	settings: AgenticSettings;
	caps: ResolvedAgentCapabilities;
	context: CodebaseContext;
	knowledgeGraph: TemporalKnowledgeGraph | null;
	pipeline: AgentPipelineStrategy;
	includeActiveFile: boolean;
	includeSelection: boolean;
}

export interface OrchestrationPreflightResult {
	snapshot: AgentWorkflowSnapshot;
	structuredIntent: StructuredIntent;
	workflowRunPlan: WorkflowRunPlan;
	contextPlan: ContextCollectionPlan;
	canonicalPhases: ReturnType<typeof selectCanonicalPhases>;
	executePhaseGating: boolean;
	approvalReason?: string;
	promptBlocks: {
		structuredIntent: string;
		intentToolRouter: string;
		contextStrategy: string;
		workflowRunPlan: string;
		approvalGate: string;
		legacyIntent: string;
		legacyToolRouter: string;
		legacyOrchestration: string;
	};
}

export function runOrchestrationPreflight(input: OrchestrationPreflightInput): OrchestrationPreflightResult {
	const preflight = runWorkflowPreflight({
		userMessage: input.userMessage,
		planOnlyMode: input.planOnlyMode,
		enableKnowledgeGraph: input.settings.enableKnowledgeGraph,
		baseHistoryLimit: input.caps.historyMessageLimit,
		baseSemanticMatches: input.caps.maxSemanticMatches,
		profile: input.settings.capabilityProfile,
	});

	const structuredIntent = classifyStructuredIntent(input.userMessage, {
		planOnlyMode: input.planOnlyMode,
		activeFilePath: input.context.activeFilePath,
	});

	const contextPlan = buildContextCollectionPlan(structuredIntent, {
		includeActiveFile: input.includeActiveFile,
		includeSelection: input.includeSelection,
		baseSemanticLimit: input.pipeline.maxSemanticMatches,
		maxContextChars: input.settings.maxContextChars,
		useWorkspaceRules: input.settings.useWorkspaceRules,
	});

	const intent = refineIntentAfterContext(input.userMessage, input.context, preflight.snapshot.intent);
	preflight.snapshot.intent = intent;

	buildWorkflowArtifacts({
		userMessage: input.userMessage,
		intent,
		context: input.context,
		knowledgeGraph: input.knowledgeGraph,
		planOnlyMode: input.planOnlyMode,
		snapshot: preflight.snapshot,
	});

	const workflowRunPlan = buildWorkflowRunPlan(
		input.runId,
		structuredIntent,
		input.context,
		preflight.snapshot,
	);

	const gate = resolveApprovalGate({
		structuredIntent,
		planOnlyMode: input.planOnlyMode,
		executeApproved: input.executeApproved,
		userMessage: input.userMessage,
		snapshot: preflight.snapshot,
		workflowRunPlan,
	});

	const canonicalPhases = selectCanonicalPhases({
		needsContextGraph: structuredIntent.needsContextGraph,
		needsPlan: preflight.snapshot.phases.includes('plan'),
		needsImpact: preflight.snapshot.phases.includes('impact'),
		needsApproval: gate.gated,
		needsVerify: structuredIntent.requiresEdits,
	});

	return {
		snapshot: preflight.snapshot,
		structuredIntent,
		workflowRunPlan,
		contextPlan,
		canonicalPhases,
		executePhaseGating: gate.gated,
		approvalReason: gate.reason,
		promptBlocks: {
			structuredIntent: buildStructuredIntentPromptBlock(structuredIntent),
			intentToolRouter: buildIntentToolRouterPromptBlock(structuredIntent),
			contextStrategy: buildContextStrategyPromptBlock(contextPlan),
			workflowRunPlan: buildWorkflowRunPlanPromptBlock(workflowRunPlan),
			approvalGate: gate.systemBlock,
			legacyIntent: buildIntentSystemBlock(intent),
			legacyToolRouter: buildToolRouterSystemBlock(intent),
			legacyOrchestration: '', // filled by caller from buildWorkflowOrchestrationPromptBlock
		},
	};
}

export function mergeOrchestrationPromptBlocks(blocks: OrchestrationPreflightResult['promptBlocks'], legacyOrchestration: string): string {
	return [
		blocks.structuredIntent,
		blocks.intentToolRouter,
		blocks.contextStrategy,
		blocks.workflowRunPlan,
		blocks.approvalGate,
		blocks.legacyIntent,
		blocks.legacyToolRouter,
		legacyOrchestration,
	].filter(Boolean).join('\n\n');
}
