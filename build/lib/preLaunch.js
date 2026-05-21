"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-check
const path_1 = require("path");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path_1.resolve(__dirname, '..', '..');
const AGENTIC_REACT_BUNDLE = 'out/vs/workbench/contrib/agentic/browser/react/out/agentic-tsx/index.js';
const AGENTIC_REACT_SRC = 'src/vs/workbench/contrib/agentic/browser/react/src';
const AGENTIC_CSS = 'out/vs/workbench/contrib/agentic/browser/styles/agentic.css';
const AGENTIC_CSS_SRC = 'src/vs/workbench/contrib/agentic/browser/styles/agentic.css';
const CHAT_SERVICE_SRC = 'src/vs/workbench/contrib/agentic/browser/services/chatThreadService.ts';
const CHAT_SERVICE_OUT = 'out/vs/workbench/contrib/agentic/browser/services/chatThreadService.js';
function runProcess(command, args = []) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
        child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
        child.on('error', reject);
    });
}
async function exists(subdir) {
    try {
        await fs_1.promises.stat(path_1.join(rootDir, subdir));
        return true;
    }
    catch {
        return false;
    }
}
async function fileMtimeMs(relativePath) {
    try {
        const st = await fs_1.promises.stat(path_1.join(rootDir, relativePath));
        return st.mtimeMs;
    }
    catch {
        return 0;
    }
}
async function maxMtimeMsInDir(relativeDir) {
    const dir = path_1.join(rootDir, relativeDir);
    let max = 0;
    async function walk(current) {
        let entries;
        try {
            entries = await fs_1.promises.readdir(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = path_1.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            }
            else if (/\.(tsx?|css)$/.test(entry.name)) {
                const st = await fs_1.promises.stat(full);
                max = Math.max(max, st.mtimeMs);
            }
        }
    }
    await walk(dir);
    return max;
}
async function isSrcNewerThanOut(srcRel, outRel) {
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
/** Rebuild Agentic/Void React bundles when UI sources are newer than the shipped bundle. */
async function ensureReactBundles() {
    const bundleMtime = await fileMtimeMs(AGENTIC_REACT_BUNDLE);
    const srcMtime = await maxMtimeMsInDir(AGENTIC_REACT_SRC);
    const cssSrcMtime = await fileMtimeMs(AGENTIC_CSS_SRC);
    const cssOutMtime = await fileMtimeMs(AGENTIC_CSS);
    const needsReactBuild = !bundleMtime ||
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
    const needsCompile = await isSrcNewerThanOut(CHAT_SERVICE_SRC, CHAT_SERVICE_OUT) ||
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
