/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parsePlanProposalContent } from '../../common/planProposalContent.js';

const SAMPLE = `Here is a summary of the repository and a step-by-step improvement plan:

---

### Current Structure & Observations
- **main.py:** Minimal FastAPI app.
- **config.py:** Good foundation using pydantic settings.

---

### Detailed Step-by-Step Improvement Plan

#### **1. Foundation & Structure**
- Expand requirements.txt based on framework usage.
- Implement a database session factory in db/session.py.

#### **2. Modular API Design**
- Create at least one module in modules/.

---

Would you like to proceed with code structure improvements, .env example documentation, or another specific enhancement?`;

suite('planProposalContent', () => {
	test('parses structured plan and choices', () => {
		const parsed = parsePlanProposalContent(SAMPLE);
		assert.ok(parsed);
		assert.ok(parsed!.sections.length >= 2);
		assert.ok(parsed!.choices.length >= 2);
		assert.ok(parsed!.choices.some(c => /env|structure/i.test(c.label)));
	});
});
