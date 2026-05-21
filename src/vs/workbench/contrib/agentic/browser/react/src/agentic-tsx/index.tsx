/*--------------------------------------------------------------------------------------
 *  Agentic AI — React entry (mount)
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js';
import { AgenticChat } from '../components/AgenticChat.js';

// Pass the component directly (same as Void sidebar). Avoid JSX here — the bundle
// would emit React.createElement without a React import and the view stays blank.
export const mountAgenticView = mountFnGenerator(AgenticChat);
