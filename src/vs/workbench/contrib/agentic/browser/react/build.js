/*--------------------------------------------------------------------------------------
 *  Agentic AI — build React bundle (run from react/ directory)
 *--------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const srcOut = path.join(__dirname, 'out', 'agentic-tsx', 'index.js');
/** Runtime bundle loaded by compiled agenticPane.js (repo root out/vs/...) */
const runtimeOut = path.join(
	__dirname,
	'../../../../../../../out/vs/workbench/contrib/agentic/browser/react/out/agentic-tsx/index.js',
);

console.log('📦 Building Agentic React bundle...');
execSync('npx tsup', { stdio: 'inherit', cwd: __dirname });

for (const dest of [runtimeOut]) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(srcOut, dest);
}
console.log('✅ Agentic React build complete →', runtimeOut);
