/*--------------------------------------------------------------------------------------
 *  Agentic AI — lightweight JSON-schema validation for tool arguments
 *--------------------------------------------------------------------------------------*/

import type { ToolDefinition } from './toolTypes.js';

export interface ToolValidationResult {
	valid: boolean;
	errors: string[];
}

export function validateToolArgs(
	def: ToolDefinition,
	args: Record<string, unknown>,
): ToolValidationResult {
	const errors: string[] = [];
	const schema = def.inputSchema as {
		type?: string;
		required?: string[];
		properties?: Record<string, { type?: string }>;
	};

	if (schema.type && schema.type !== 'object') {
		errors.push(`Tool ${def.name} schema must be an object`);
		return { valid: false, errors };
	}

	for (const key of schema.required ?? []) {
		if (args[key] === undefined || args[key] === null || args[key] === '') {
			errors.push(`Missing required argument: ${key}`);
		}
	}

	for (const [key, prop] of Object.entries(schema.properties ?? {})) {
		if (args[key] === undefined) {
			continue;
		}
		const expected = prop.type;
		if (!expected) {
			continue;
		}
		const actual = typeof args[key];
		if (expected === 'string' && actual !== 'string') {
			errors.push(`Argument ${key} must be a string`);
		}
		if (expected === 'number' && actual !== 'number') {
			errors.push(`Argument ${key} must be a number`);
		}
		if (expected === 'boolean' && actual !== 'boolean') {
			errors.push(`Argument ${key} must be a boolean`);
		}
	}

	return { valid: errors.length === 0, errors };
}

export function stringifyToolResult(name: string, result: unknown, isError = false): string {
	if (typeof result === 'string') {
		const prefix = isError ? `[tool_error:${name}] ` : `[tool_result:${name}] `;
		return prefix + result;
	}
	const prefix = isError ? `[tool_error:${name}] ` : `[tool_result:${name}] `;
	try {
		return prefix + JSON.stringify(result, null, 2);
	} catch {
		return prefix + String(result);
	}
}
