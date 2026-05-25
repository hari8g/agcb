/*--------------------------------------------------------------------------------------
 *  Agentic AI — mandatory final run summary schema
 *--------------------------------------------------------------------------------------*/

import type { ChatMessage } from '../agenticTypes.js';
import type { WorkflowCompletionSummary } from '../workflowSummary.js';
import { buildWorkflowCompletionSummary } from '../workflowSummary.js';
import { analyzeWorkflowRunQuality } from '../workflowRunQuality.js';
import type { RunQualityReport } from './runQualityReport.js';
import type { StructuredIntent } from './structuredIntent.js';
import type { VerificationState } from './verificationLoop.js';
import type { WorkflowRunPlan } from './workflowRunPlanner.js';

export interface RunFinalSummary extends WorkflowCompletionSummary {
	understood: string;
	filesChanged: string[];
	toolsUsed: string[];
	testsLintBuildRun: string[];
	verificationResult: string;
	failures: string[];
	assumptions: string[];
	suggestedJiraStatus?: string;
	qualityScore: number;
	qualityIssues: string[];
}

export function buildRunFinalSummary(opts: {
	userMessage: string;
	assistantMessage: ChatMessage;
	structuredIntent?: StructuredIntent;
	workflowRunPlan?: WorkflowRunPlan;
	verification?: VerificationState;
	qualityReport?: RunQualityReport;
	planStall?: boolean;
}): RunFinalSummary {
	const quality = analyzeWorkflowRunQuality(opts.assistantMessage, opts.userMessage);
	const base = buildWorkflowCompletionSummary({
		userMessage: opts.userMessage,
		assistantMessage: opts.assistantMessage,
		planStall: opts.planStall,
		runQuality: quality,
	});

	const toolNames = [...new Set((opts.assistantMessage.toolCalls ?? []).map(tc => tc.name))];
	const filesChanged = [...new Set(
		(opts.assistantMessage.toolCalls ?? [])
			.filter(tc => ['write_file', 'propose_file_edit', 'apply_file_edit'].includes(tc.name) && tc.status === 'complete')
			.map(tc => String(tc.arguments.path ?? ''))
			.filter(Boolean),
	)];

	const verification = opts.verification ?? { status: 'not_run' as const, commandsAttempted: [], lintChecked: false, repairAttempted: false };
	const verifyCmds = opts.workflowRunPlan?.verificationStrategy.suggestedCommands ?? [];
	const testsLintBuild = [
		...verification.commandsAttempted,
		...(verification.lintChecked ? ['read_lint_errors'] : []),
		...verifyCmds.filter(c => !verification.commandsAttempted.includes(c)),
	];

	const failures: string[] = [];
	if (opts.qualityReport?.issues.length) {
		failures.push(...opts.qualityReport.issues);
	}
	if (verification.status === 'failed' && verification.lastFailureOutput) {
		failures.push(verification.lastFailureOutput.slice(0, 500));
	}

	const assumptions: string[] = [];
	if (opts.structuredIntent?.implicitGoals.length) {
		assumptions.push(...opts.structuredIntent.implicitGoals);
	}
	if (opts.workflowRunPlan?.projectModel.packageManagers.length) {
		assumptions.push(`Package manager: ${opts.workflowRunPlan.projectModel.packageManagers.join(', ')}`);
	}

	let suggestedJira: string | undefined;
	if (opts.structuredIntent?.intent === 'jira_workflow') {
		suggestedJira = base.completionKind === 'success' ? 'Ready for review' : 'In progress';
	} else if (opts.structuredIntent?.intent === 'fix_bug' && base.completionKind === 'success') {
		suggestedJira = 'Fix implemented — verify in QA';
	}

	const qualityReport = opts.qualityReport ?? {
		score: base.completionKind === 'success' ? 85 : 50,
		completionKind: base.completionKind,
		toolsUsed: toolNames.length,
		filesRead: 0,
		filesChanged: filesChanged.length,
		verificationStatus: verification.status,
		approvalRequired: false,
		retryCount: 0,
		nudgeCount: 0,
		issues: failures,
		blockers: failures,
	};

	return {
		...base,
		understood: opts.structuredIntent
			? `${opts.structuredIntent.intent} (${opts.structuredIntent.scope}, ${opts.structuredIntent.complexity})`
			: base.asked,
		filesChanged,
		toolsUsed: toolNames,
		testsLintBuildRun: testsLintBuild,
		verificationResult: verification.status === 'not_run'
			? 'Not run'
			: verification.status === 'passed'
				? 'Passed'
				: verification.status === 'failed'
					? 'Failed'
					: 'Skipped',
		failures,
		assumptions,
		suggestedJiraStatus: suggestedJira,
		qualityScore: qualityReport.score,
		qualityIssues: qualityReport.issues,
	};
}

export function formatRunFinalSummaryMarkdown(summary: RunFinalSummary): string {
	const lines = [
		'## Run summary',
		'',
		'### Understood',
		summary.understood,
		'',
		'### What changed',
		summary.filesChanged.length
			? summary.filesChanged.map(f => `- \`${f}\``).join('\n')
			: '- No files changed',
		'',
		'### Tools used',
		summary.toolsUsed.length ? summary.toolsUsed.map(t => `- ${t}`).join('\n') : '- None',
		'',
		'### Verification',
		`- Result: **${summary.verificationResult}**`,
		summary.testsLintBuildRun.length
			? `- Commands/checks: ${summary.testsLintBuildRun.join(', ')}`
			: '',
		'',
		'### Outcome',
		`**${summary.completionKind}** (quality ${summary.qualityScore}/100)`,
		summary.outcome ? summary.outcome : '',
	];
	if (summary.failures.length) {
		lines.push('', '### Failures', ...summary.failures.map(f => `- ${f}`));
	}
	if (summary.assumptions.length) {
		lines.push('', '### Assumptions', ...summary.assumptions.map(a => `- ${a}`));
	}
	if (summary.suggestedJiraStatus) {
		lines.push('', '### Suggested JIRA status', summary.suggestedJiraStatus);
	}
	return lines.filter(Boolean).join('\n');
}
