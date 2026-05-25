/*--------------------------------------------------------------------------------------
 *  Agentic AI — React entry (mount)
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js';
import { AgenticChat } from '../components/AgenticChat.js';
import { JiraPanel } from '../components/JiraPanel.js';
import { CodebaseGraphPanel } from '../components/CodebaseGraphPanel.js';

export {
	_registerAgenticServices,
	useHasWorkspace,
	useKnowledgeGraph,
} from '../util/agenticServices.js';
export const mountAgenticView = mountFnGenerator(AgenticChat);
export const mountJiraView = mountFnGenerator(JiraPanel);
export const mountCodebaseGraphView = mountFnGenerator(CodebaseGraphPanel);
