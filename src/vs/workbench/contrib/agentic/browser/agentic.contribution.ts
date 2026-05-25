/*--------------------------------------------------------------------------------------
 *  Agentic AI — workbench contribution (browser)
 *--------------------------------------------------------------------------------------*/

// IPC client (must load early)
import '../common/agenticRuntimeService.js';

// Browser services (order: settings → code intel → context → approvals → chat thread → agent loop)
import './services/agenticSettingsService.js';
import './services/agenticMcpService.js';
import './services/jiraWorkflowServiceInterface.js';
import './services/codeIntelligenceService.js';
import './services/knowledgeGraphService.js';
import './services/symbolImpactService.js';
import './services/sessionMemoryService.js';
import './services/agentMetricsService.js';
import './services/agentRunPreflightService.js';
import './services/workspaceRulesService.js';
import './services/contextCollectorService.js';
import './services/editApprovalService.js';
import './services/agenticVoidToolBridgeService.js';
import './services/agenticEditorBridgeService.js';
import './services/chatThreadService.js';
import './services/jiraWorkflowService.js';
import './services/agentLoopService.js';

import './agenticRendererTools.contribution.js';

import './agenticJiraPane.js';
import './agenticPane.js';
