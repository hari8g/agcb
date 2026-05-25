/*--------------------------------------------------------------------------------------
 *  Agentic AI — canonical workflow run plan object
 *--------------------------------------------------------------------------------------*/

import type { AgentWorkflowSnapshot } from '../agentWorkflowOrchestration.js';
import type { CodebaseContext } from '../contextTypes.js';
import type { StructuredIntent } from './structuredIntent.js';

export interface WorkflowRunStep {
	id: string;
	phase: string;
	title: string;
	kind: 'read' | 'search' | 'edit' | 'test' | 'verify' | 'approval';
	targetPaths?: string[];
}

export interface WorkflowRunPlan {
	runId: string;
	intent: StructuredIntent;
	projectModel: {
		workspaceRoots: string[];
		activeFile?: string;
		languageId?: string;
		packageManagers: string[];
	};
	steps: WorkflowRunStep[];
	targetFiles: string[];
	blastRadius: {
		level: 'low' | 'medium' | 'high';
		primaryTargets: string[];
		affectedCount: number;
		summary: string;
	};
	approvalReason?: string;
	verificationStrategy: {
		runLint: boolean;
		runTests: boolean;
		suggestedCommands: string[];
	};
}

function detectPackageManagers(context: CodebaseContext): string[] {
	const pms = new Set<string>();
	const digest = context.codeGraph?.knowledgeGraphDigest ?? '';
	if (/package-lock\.json|"npm"/i.test(digest)) {
		pms.add('npm');
	}
	if (/pnpm-lock|pnpm/i.test(digest)) {
		pms.add('pnpm');
	}
	if (/yarn\.lock|yarn/i.test(digest)) {
		pms.add('yarn');
	}
	if (pms.size === 0) {
		pms.add('npm');
	}
	return [...pms];
}

function inferVerificationCommands(intent: StructuredIntent): string[] {
	const cmds: string[] = [];
	if (intent.intent === 'write_tests' || intent.implicitGoals.some(g => /test/i.test(g))) {
		cmds.push('npm test');
	}
	if (intent.intent === 'fix_bug' || intent.intent === 'edit_file') {
		cmds.push('npm run lint');
	}
	if (intent.intent === 'create_file' && intent.explicitPaths.some(p => /package\.json/i.test(p))) {
		cmds.push('npm run build');
	}
	return cmds.slice(0, 4);
}

export function buildWorkflowRunPlan(
	runId: string,
	intent: StructuredIntent,
	context: CodebaseContext,
	snapshot?: AgentWorkflowSnapshot,
): WorkflowRunPlan {
	const targetFiles = [
		...new Set([
			...intent.explicitPaths,
			...(snapshot?.impact?.primaryTargets ?? []),
			...(snapshot?.plan?.steps.flatMap(s => s.targetPaths ?? []) ?? []),
			...(context.activeFilePath ? [context.activeFilePath] : []),
		]),
	].filter(Boolean).slice(0, 24);

	const steps: WorkflowRunStep[] = [];
	let stepId = 1;
	steps.push({
		id: `w${stepId++}`,
		phase: 'collect_context',
		title: 'Confirm workspace and target paths',
		kind: 'read',
		targetPaths: targetFiles.slice(0, 6),
	});

	if (intent.needsApproval) {
		steps.push({
			id: `w${stepId++}`,
			phase: 'approval_gate',
			title: 'Present plan and await approval',
			kind: 'approval',
		});
	}

	if (intent.requiresEdits) {
		steps.push({
			id: `w${stepId++}`,
			phase: 'execute',
			title: intent.intent === 'create_file' ? 'Create files with write_file' : 'Apply focused edits',
			kind: 'edit',
			targetPaths: targetFiles,
		});
	}

	const verifyCmds = inferVerificationCommands(intent);
	if (verifyCmds.length || intent.requiresEdits) {
		steps.push({
			id: `w${stepId++}`,
			phase: 'verify',
			title: 'Verify lint/tests/build',
			kind: 'verify',
		});
	}

	const affectedCount = snapshot?.impact?.affectedPaths?.length ?? targetFiles.length;
	const blastLevel = snapshot?.impact?.riskLevel ?? intent.risk;

	return {
		runId,
		intent,
		projectModel: {
			workspaceRoots: context.workspaceFolderUris,
			activeFile: context.activeFilePath ?? undefined,
			languageId: context.activeFileLanguageId ?? undefined,
			packageManagers: detectPackageManagers(context),
		},
		steps,
		targetFiles,
		blastRadius: {
			level: blastLevel,
			primaryTargets: snapshot?.impact?.primaryTargets ?? targetFiles.slice(0, 6),
			affectedCount,
			summary: snapshot?.impact?.blastRadiusSummary
				?? `${targetFiles.length} target path(s); scope=${intent.scope}`,
		},
		approvalReason: intent.needsApproval
			? (intent.complexity === 'complex'
				? 'Complex repo-level change requires plan approval before edits'
				: intent.intent === 'run_command'
					? 'Terminal commands require explicit approval'
					: 'Plan-only or high-risk operation')
			: undefined,
		verificationStrategy: {
			runLint: intent.requiresEdits,
			runTests: intent.intent === 'write_tests' || verifyCmds.some(c => /test/i.test(c)),
			suggestedCommands: verifyCmds,
		},
	};
}

export function buildWorkflowRunPlanPromptBlock(plan: WorkflowRunPlan): string {
	const lines = [
		'<workflow_run_plan>',
		`run_id: ${plan.runId}`,
		`intent: ${plan.intent.intent} (${plan.intent.complexity}, ${plan.intent.scope})`,
		`blast_radius: ${plan.blastRadius.level} — ${plan.blastRadius.summary}`,
	];
	if (plan.approvalReason) {
		lines.push(`approval: ${plan.approvalReason}`);
	}
	if (plan.verificationStrategy.suggestedCommands.length) {
		lines.push(`verify: ${plan.verificationStrategy.suggestedCommands.join(' | ')}`);
	}
	lines.push('', 'Steps:');
	for (const s of plan.steps) {
		const paths = s.targetPaths?.length ? ` [${s.targetPaths.map(p => p.split(/[/\\]/).pop()).join(', ')}]` : '';
		lines.push(`${s.id}. (${s.kind}) ${s.title}${paths}`);
	}
	lines.push('</workflow_run_plan>');
	return lines.join('\n');
}
