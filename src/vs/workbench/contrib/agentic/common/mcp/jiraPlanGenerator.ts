/*--------------------------------------------------------------------------------------
 *  Agentic AI — structured JIRA workflow plan (deterministic heuristics)
 *--------------------------------------------------------------------------------------*/

import { classifyJiraTicketIntent, intentLabel } from './jiraToolRegistry.js';
import type { JiraIssueContext } from './jiraTypes.js';
import type { JiraTicket, JiraWorkflowPlan } from './jiraWorkflowTypes.js';
import { discoverLikelyFilesForTicket, extractTicketSearchTerms } from './jiraWorkspaceDiscovery.js';

export interface WorkspaceScanHint {
	relativePaths: string[];
	packageJsonScripts: Record<string, string[]>;
	hasFrontend: boolean;
	hasBackend: boolean;
	isMonorepo: boolean;
}

export function ticketToIssueContext(ticket: JiraTicket): JiraIssueContext {
	return {
		issueKey: ticket.key,
		summary: ticket.summary,
		description: ticket.description,
		status: ticket.status,
		issueType: ticket.issueType,
		assignee: ticket.assignee,
		labels: ticket.labels,
		fetchedAt: Date.now(),
	};
}

/** Build an actionable workflow plan from ticket + workspace hints. */
export function generateWorkflowPlan(ticket: JiraTicket, workspace: WorkspaceScanHint): JiraWorkflowPlan {
	const ctx = ticketToIssueContext(ticket);
	const intent = classifyJiraTicketIntent(ctx);
	const intentName = intentLabel(intent);

	const desc = (ticket.description ?? '').toLowerCase();
	const summary = (ticket.summary ?? '').toLowerCase();
	const hay = `${summary} ${desc}`;

	const affectedAreas: string[] = [];
	if (workspace.hasFrontend) affectedAreas.push('frontend');
	if (workspace.hasBackend) affectedAreas.push('backend');
	if (workspace.isMonorepo) affectedAreas.push('monorepo root');
	if (!affectedAreas.length) affectedAreas.push('workspace root');

	const likelyFiles = discoverLikelyFilesForTicket(ticket, workspace.relativePaths, { max: 20 });
	const searchTerms = extractTicketSearchTerms(ticket);

	const commandsToRun: string[] = [];
	for (const [pkg, scripts] of Object.entries(workspace.packageJsonScripts)) {
		if (scripts.includes('build')) commandsToRun.push(`npm run build — ${pkg}`);
		if (scripts.includes('test')) commandsToRun.push(`npm test — ${pkg}`);
		if (scripts.includes('compile')) commandsToRun.push(`npm run compile — ${pkg}`);
	}
	if (!commandsToRun.length) {
		commandsToRun.push('npm run compile (if package.json defines it)');
		commandsToRun.push('npm test (if available)');
	}

	const implementationSteps: string[] = [
		`Confirm ticket ${ticket.key} scope: ${ticket.summary}`,
		'Read ticket description and acceptance criteria.',
		'list_workspace or list_files at repo root — map folder structure before editing.',
		`grep or search_files for: ${searchTerms.slice(0, 8).join(', ') || 'domain keywords from ticket'}.`,
		'read_file on existing modules (models, routes, pages) — do NOT stop at package.json only.',
	];
	if (workspace.hasFrontend) {
		implementationSteps.push('Inspect frontend entry points, routes/pages, and components for the feature.');
		implementationSteps.push('Run frontend build after dependency or code changes.');
	}
	if (workspace.hasBackend) {
		implementationSteps.push('Inspect backend models, APIs, validation, and admin routes.');
		implementationSteps.push('Run backend build/start validation if applicable.');
	}
	if (/build|compile|webpack|gulp|npm/i.test(hay)) {
		implementationSteps.push('Trace build/compile errors from logs; fix missing deps or script config.');
	}
	if (/test|jest|mocha|playwright/i.test(hay)) {
		implementationSteps.push('Run test suite for touched packages before JIRA update.');
	}
	implementationSteps.push('Apply minimal code changes aligned with ticket intent.');
	implementationSteps.push('Re-run validation commands until pass or document blocker.');
	implementationSteps.push('Comment on JIRA with summary, files, and validation outcome.');
	implementationSteps.push('Transition JIRA status only after validation completes.');

	const risks: string[] = [];
	if (workspace.isMonorepo) risks.push('Monorepo: changes may affect multiple packages — validate all touched areas.');
	if (/dependency|upgrade|bump/i.test(hay)) risks.push('Dependency changes may break lockfiles or peer versions.');
	if (intent === 'devops') risks.push('CI/pipeline changes need dry-run or staging validation.');
	if (!workspace.relativePaths.length) risks.push('Limited workspace scan — verify paths manually.');

	let recommendedTransitionStatus = 'In Review';
	if (intent === 'documentation' || /chore|maintenance/i.test(hay)) {
		recommendedTransitionStatus = 'Done';
	}
	if (/bug|fix|error|broken/i.test(hay) && !/review/i.test(hay)) {
		recommendedTransitionStatus = 'In Review';
	}

	const scope: string[] = [
		`Ticket: ${ticket.key} (${ticket.issueType ?? 'Issue'})`,
		`Intent: ${intentName}`,
		`Status: ${ticket.status ?? 'unknown'}`,
	];
	if (ticket.labels?.length) scope.push(`Labels: ${ticket.labels.join(', ')}`);

	return {
		ticketKey: ticket.key,
		problemUnderstanding: [
			`${ticket.key}: ${ticket.summary}`,
			ticket.description
				? `Description excerpt: ${ticket.description.slice(0, 400)}${ticket.description.length > 400 ? '…' : ''}`
				: 'No description on ticket — infer scope from summary and codebase.',
			`Classified as ${intentName} work.`,
		].join('\n'),
		scope,
		affectedAreas,
		likelyFiles: likelyFiles.length ? likelyFiles : ['package.json (workspace root)'],
		commandsToRun: [...new Set(commandsToRun)].slice(0, 6),
		risks,
		implementationSteps,
		validationCriteria: [
			'Project builds without new errors in targeted packages.',
			'Tests pass where a test script exists.',
			'No unrelated files modified.',
			'JIRA comment documents changes and validation result.',
			`JIRA transition to "${recommendedTransitionStatus}" only after validation.`,
		],
		recommendedTransitionStatus,
	};
}

export function buildExecutionUserPrompt(plan: JiraWorkflowPlan, ticket: JiraTicket): string {
	const codePaths = plan.likelyFiles.filter(p => !/package\.json$/i.test(p)).slice(0, 12);
	const configPaths = plan.likelyFiles.filter(p => /package\.json$/i.test(p)).slice(0, 4);
	return [
		`[JIRA EXECUTION] ${plan.ticketKey}: implement the approved engineering plan with tools — no plan-only prose.`,
		`Implement the approved engineering plan for JIRA ticket ${plan.ticketKey}.`,
		'',
		'## Problem',
		plan.problemUnderstanding,
		'',
		'## Mandatory tool workflow (first 3 turns)',
		'1. **list_workspace** or **list_files** — understand repo layout.',
		'2. **grep** / **search_files** — find seller/onboarding/admin/auth modules from the ticket.',
		'3. **read_file** on relevant source files (see paths below) — then **write_file** / **propose_file_edit** for real code.',
		'',
		codePaths.length
			? `## Likely source paths to inspect\n${codePaths.map(p => `- ${p}`).join('\n')}`
			: '## Likely source paths\n- Search the repo for modules matching ticket domain terms before editing.',
		configPaths.length
			? `\n## Config (scripts only — not sufficient alone)\n${configPaths.map(p => `- ${p}`).join('\n')}`
			: '',
		'',
		'## Implementation steps',
		...plan.implementationSteps.map((s, i) => `${i + 1}. ${s}`),
		'',
		'## Commands to run',
		...plan.commandsToRun.map(c => `- ${c}`),
		'',
		'## Validation',
		...plan.validationCriteria.map(c => `- ${c}`),
		'',
		'Deliver backend + frontend + tests as described in the ticket. package.json-only changes are insufficient.',
		`After success: comment on JIRA and transition toward "${plan.recommendedTransitionStatus}".`,
		'',
		`Ticket summary: ${ticket.summary}`,
	].join('\n');
}
