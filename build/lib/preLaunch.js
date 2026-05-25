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
const WORKBENCH_MAIN_JS = 'out/vs/workbench/workbench.desktop.main.js';
const WORKBENCH_MAIN_CSS = 'out/vs/workbench/workbench.desktop.main.css';
const BOOTSTRAP_WINDOW_JS = 'out/bootstrap-window.js';
const WORKBENCH_COMMON_JS = 'out/vs/workbench/workbench.common.main.js';
const WORKBENCH_DEV_HTML = 'out/vs/code/electron-sandbox/workbench/workbench-dev.html';
/** Dev entry is ~12KB; bundled out-vscode copy is ~35MB and breaks CSS import maps. */
const WORKBENCH_MAIN_JS_BUNDLED_MIN_BYTES = 1000000;
const WORKBENCH_MAIN_JS_DEV_MAX_BYTES = 100000;
const DEV_WORKBENCH_REQUIRED_FILES = [
    'out/main.js',
    BOOTSTRAP_WINDOW_JS,
    WORKBENCH_DEV_HTML,
    WORKBENCH_COMMON_JS,
    WORKBENCH_MAIN_JS,
];
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
async function fileSizeBytes(relativePath) {
    try {
        const st = await fs_1.promises.stat(path_1.join(rootDir, relativePath));
        return st.size;
    }
    catch {
        return 0;
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
    await ensureAgenticCss();
}
async function ensureAgenticCss() {
    const outDir = path_1.join(rootDir, 'out/vs/workbench/contrib/agentic/browser/styles');
    const srcPath = path_1.join(rootDir, AGENTIC_CSS_SRC);
    const outPath = path_1.join(rootDir, AGENTIC_CSS);
    try {
        const srcMtime = await fileMtimeMs(AGENTIC_CSS_SRC);
        const outMtime = await fileMtimeMs(AGENTIC_CSS);
        if (srcMtime > outMtime) {
            await fs_1.promises.mkdir(outDir, { recursive: true });
            await fs_1.promises.copyFile(srcPath, outPath);
        }
    }
    catch {
        // non-fatal
    }
}
async function devWorkbenchTreeReady() {
    for (const rel of DEV_WORKBENCH_REQUIRED_FILES) {
        if (!(await fileSizeBytes(rel))) {
            return false;
        }
    }
    const mainBytes = await fileSizeBytes(WORKBENCH_MAIN_JS);
    return mainBytes > 0 && mainBytes <= WORKBENCH_MAIN_JS_DEV_MAX_BYTES;
}
async function ensureDevWorkbenchEntry() {
    const bytes = await fileSizeBytes(WORKBENCH_MAIN_JS);
    const isBundled = bytes >= WORKBENCH_MAIN_JS_BUNDLED_MIN_BYTES;
    if (isBundled) {
        console.log('[preLaunch] Removing bundled workbench.desktop.main.js from out/ (incompatible with dev CSS import maps)');
        console.log('[preLaunch] Quit all Agentic_MPS windows before compile — npm run compile deletes out/');
        await fs_1.promises.unlink(path_1.join(rootDir, WORKBENCH_MAIN_JS)).catch(() => { });
        await fs_1.promises.unlink(path_1.join(rootDir, WORKBENCH_MAIN_CSS)).catch(() => { });
    }
    if (await devWorkbenchTreeReady()) {
        return;
    }
    const missing = [];
    for (const rel of DEV_WORKBENCH_REQUIRED_FILES) {
        if (!(await fileSizeBytes(rel))) {
            missing.push(rel);
        }
    }
    if (missing.length) {
        console.log(`[preLaunch] Dev workbench files missing (${missing.join(', ')}) — running npm run compile`);
    }
    else if (bytes > WORKBENCH_MAIN_JS_DEV_MAX_BYTES) {
        console.log('[preLaunch] workbench.desktop.main.js is a production bundle — running npm run compile for dev ESM entry');
    }
    else {
        console.log('[preLaunch] Dev workbench entry incomplete — running npm run compile');
    }
    await runProcess(npm, ['run', 'compile']);
    if (!(await devWorkbenchTreeReady())) {
        console.error('[preLaunch] Dev workbench entry is not ready. Quit the app, then run:\n' +
            '  npm run compile\n' +
            '  npm run buildreact\n' +
            '  ./scripts/code.sh --user-data-dir ./.tmp/user-data --extensions-dir ./.tmp/extensions');
        process.exit(1);
    }
}
async function ensureCompiled() {
    const mainJsBytes = await fileSizeBytes('out/main.js');
    if (mainJsBytes < 1000) {
        console.log('[preLaunch] out/main.js missing — running compile (quit the app first; compile while open breaks the window)');
        await runProcess(npm, ['run', 'compile']);
    }
    await ensureDevWorkbenchEntry();
    const agenticCssStale = await isSrcNewerThanOut(AGENTIC_CSS_SRC, AGENTIC_CSS);
    if (agenticCssStale) {
        console.warn('[preLaunch] agentic.css is stale. Quit the app, run: npm run compile');
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
