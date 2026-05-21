/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import * as path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(__dirname, '..', '..');

const AGENTIC_REACT_BUNDLE = 'out/vs/workbench/contrib/agentic/browser/react/out/agentic-tsx/index.js';
const AGENTIC_REACT_SRC = 'src/vs/workbench/contrib/agentic/browser/react/src';
const AGENTIC_CSS = 'out/vs/workbench/contrib/agentic/browser/styles/agentic.css';
const AGENTIC_CSS_SRC = 'src/vs/workbench/contrib/agentic/browser/styles/agentic.css';
const CHAT_SERVICE_SRC = 'src/vs/workbench/contrib/agentic/browser/services/chatThreadService.ts';
const CHAT_SERVICE_OUT = 'out/vs/workbench/contrib/agentic/browser/services/chatThreadService.js';

function runProcess(command: string, args: ReadonlyArray<string> = []) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

async function fileMtimeMs(relativePath: string): Promise<number> {
	try {
		const st = await fs.stat(path.join(rootDir, relativePath));
		return st.mtimeMs;
	} catch {
		return 0;
	}
}

async function maxMtimeMsInDir(relativeDir: string): Promise<number> {
	const dir = path.join(rootDir, relativeDir);
	let max = 0;

	async function walk(current: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (/\.(tsx?|css)$/.test(entry.name)) {
				const st = await fs.stat(full);
				max = Math.max(max, st.mtimeMs);
			}
		}
	}

	await walk(dir);
	return max;
}

async function isSrcNewerThanOut(srcRel: string, outRel: string): Promise<boolean> {
	const srcMtime = await fileMtimeMs(srcRel);
	const outMtime = await fileMtimeMs(outRel);
	if (!srcMtime) {
		return false;
	}
	if (!outMtime) {
		return true;
	}
	return srcMtime > outMtime;
}

async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		await runProcess(npm, ['ci']);
	}
}

async function getElectron() {
	await runProcess(npm, ['run', 'electron']);
}

async function ensureReactBundles() {
	const bundleMtime = await fileMtimeMs(AGENTIC_REACT_BUNDLE);
	const srcMtime = await maxMtimeMsInDir(AGENTIC_REACT_SRC);
	const cssSrcMtime = await fileMtimeMs(AGENTIC_CSS_SRC);
	const cssOutMtime = await fileMtimeMs(AGENTIC_CSS);

	const needsReactBuild =
		!bundleMtime ||
		srcMtime > bundleMtime ||
		cssSrcMtime > cssOutMtime;

	if (needsReactBuild) {
		console.log('[preLaunch] Agentic/Void React UI is stale — running npm run buildreact');
		await runProcess(npm, ['run', 'buildreact']);
	}
}

async function ensureCompiled() {
	if (!(await exists('out/main.js'))) {
		console.log('[preLaunch] out/main.js missing — running compile');
		await runProcess(npm, ['run', 'compile']);
		return;
	}

	const needsCompile =
		await isSrcNewerThanOut(CHAT_SERVICE_SRC, CHAT_SERVICE_OUT) ||
		await isSrcNewerThanOut(AGENTIC_CSS_SRC, AGENTIC_CSS);

	if (needsCompile) {
		console.log('[preLaunch] Agentic workbench sources changed — running compile');
		await runProcess(npm, ['run', 'compile']);
	}
}

async function main() {
	await ensureNodeModules();
	await getElectron();
	await ensureReactBundles();
	await ensureCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = require('./builtInExtensions');
	await getBuiltInExtensions();
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
