/*--------------------------------------------------------------------------------------
 *  Agentic AI — run preflight: workflow orchestrator + symbol impact
 *--------------------------------------------------------------------------------------*/

import { buildWorkflowOrchestrationPromptBlock } from '../../common/agentWorkflowOrchestration.js';
import {
	buildPreflightTargetReadsBlock,
	buildSymbolImpactPromptBlock,
	enrichWorkflowImpactWithSymbols,
} from '../../common/symbolImpactAnalysis.js';
import type { CodebaseContext } from '../../common/contextTypes.js';
import type { TemporalKnowledgeGraph } from '../../common/codebaseKnowledgeGraph.js';
import type { AgentPipelineStrategy } from '../../common/agentPipeline.js';
import type { AgenticSettings } from '../../common/agenticSettingsTypes.js';
import type { ResolvedAgentCapabilities } from '../../common/agentCapabilities.js';
import {
	mergeOrchestrationPromptBlocks,
	runOrchestrationPreflight,
	type OrchestrationPreflightResult,
} from '../../common/orchestration/workflowOrchestrator.js';
import type { StructuredIntent } from '../../common/orchestration/structuredIntent.js';
import type { WorkflowRunPlan } from '../../common/orchestration/workflowRunPlanner.js';
import type { ContextCollectionPlan } from '../../common/orchestration/contextStrategy.js';
import type { CanonicalWorkflowPhase } from '../../common/orchestration/workflowPhases.js';

export interface AgentRunPreflightInput {
	runId: string;
	userMessage: string;
	planOnlyMode: boolean;
	executeApproved: boolean;
	settings: AgenticSettings;
	caps: ResolvedAgentCapabilities;
	mentionBlock: string;
	context: CodebaseContext;
	knowledgeGraph: TemporalKnowledgeGraph | null;
	pipeline: AgentPipelineStrategy;
	includeActiveFile: boolean;
	includeSelection: boolean;
	analyzeSymbolTargets: (paths: string[]) => Promise<import('../../common/symbolImpactAnalysis.js').SymbolImpactAnalysis | null>;
	readTargetFilesParallel: (paths: string[]) => Promise<import('../../common/symbolImpactAnalysis.js').PreflightFileSnippet[]>;
	sessionMemoryBlock: string;
	/** Void-style simple path: minimal prompt blocks, no workflow plan UI */
	voidLikeSimple?: boolean;
}

export interface AgentRunPreflightResult {
	snapshot: OrchestrationPreflightResult['snapshot'];
	pipeline: AgentPipelineStrategy;
	executePhaseGating: boolean;
	context: CodebaseContext;
	intentSystemBlock: string;
	toolRouterSystemBlock: string;
	executeGatingSystemBlock: string;
	workflowOrchestrationBlock: string;
	sessionMemoryBlock: string;
	structuredIntent: StructuredIntent;
	workflowRunPlan: WorkflowRunPlan;
	contextPlan: ContextCollectionPlan;
	canonicalPhases: CanonicalWorkflowPhase[];
	approvalReason?: string;
}

export async function buildAgentRunPreflight(input: AgentRunPreflightInput): Promise<AgentRunPreflightResult> {
	const orchestration = runOrchestrationPreflight({
		runId: input.runId,
		userMessage: input.userMessage,
		planOnlyMode: input.planOnlyMode,
		executeApproved: input.executeApproved,
		settings: input.settings,
		caps: input.caps,
		context: input.context,
		knowledgeGraph: input.knowledgeGraph,
		pipeline: input.pipeline,
		includeActiveFile: input.includeActiveFile,
		includeSelection: input.includeSelection,
	});

	let context = input.context;
	const executePhaseGating = orchestration.executePhaseGating;

	const preflightContextBlocks: string[] = [];
	const skipHeavyPreflight =
		orchestration.structuredIntent.complexity === 'simple'
		|| orchestration.structuredIntent.intent === 'create_file';
	if (orchestration.snapshot.phases.includes('impact') && orchestration.snapshot.impact && !skipHeavyPreflight) {
		const targets = orchestration.snapshot.impact.primaryTargets;
		const symbolAnalysis = await input.analyzeSymbolTargets(targets);
		if (symbolAnalysis) {
			orchestration.snapshot.impact = enrichWorkflowImpactWithSymbols(
				orchestration.snapshot.impact,
				symbolAnalysis,
			);
			const symbolBlock = buildSymbolImpactPromptBlock(symbolAnalysis);
			if (symbolBlock) {
				preflightContextBlocks.push(symbolBlock);
			}
		}
		if (
			orchestration.snapshot.complexity === 'complex'
			&& !executePhaseGating
			&& targets.length > 0
		) {
			const snippets = await input.readTargetFilesParallel(targets);
			const readsBlock = buildPreflightTargetReadsBlock(snippets);
			if (readsBlock) {
				preflightContextBlocks.push(readsBlock);
			}
		}
	}
	if (preflightContextBlocks.length) {
		context = {
			...context,
			codeGraph: {
				...context.codeGraph,
				knowledgeGraphDigest: [
					context.codeGraph.knowledgeGraphDigest ?? '',
					...preflightContextBlocks,
				].filter(Boolean).join('\n\n'),
			},
		};
	}

	const voidLike = input.voidLikeSimple === true;
	const legacyOrchestration = voidLike ? '' : buildWorkflowOrchestrationPromptBlock(orchestration.snapshot);
	const mergedOrchestration = voidLike
		? orchestration.promptBlocks.legacyToolRouter
		: mergeOrchestrationPromptBlocks(orchestration.promptBlocks, legacyOrchestration);

	return {
		snapshot: orchestration.snapshot,
		pipeline: input.pipeline,
		executePhaseGating,
		context,
		intentSystemBlock: voidLike ? '' : orchestration.promptBlocks.legacyIntent,
		toolRouterSystemBlock: orchestration.promptBlocks.legacyToolRouter,
		executeGatingSystemBlock: voidLike ? '' : orchestration.promptBlocks.approvalGate,
		workflowOrchestrationBlock: voidLike ? '' : mergedOrchestration,
		sessionMemoryBlock: input.sessionMemoryBlock,
		structuredIntent: orchestration.structuredIntent,
		workflowRunPlan: orchestration.workflowRunPlan,
		contextPlan: orchestration.contextPlan,
		canonicalPhases: orchestration.canonicalPhases,
		approvalReason: orchestration.approvalReason,
	};
}
