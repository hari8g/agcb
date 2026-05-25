/*--------------------------------------------------------------------------------------
 *  Agentic AI — lightweight force-directed layout for knowledge graph SVG
 *--------------------------------------------------------------------------------------*/

export interface GraphLayoutNode {
	id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
}

const MAX_NODES = 120;

export function computeForceLayout(
	nodeIds: string[],
	edges: { from: string; to: string }[],
	width: number,
	height: number,
	seed = 1,
): Map<string, { x: number; y: number }> {
	const ids = nodeIds.slice(0, MAX_NODES);
	const positions = new Map<string, GraphLayoutNode>();
	const cx = width / 2;
	const cy = height / 2;
	const radius = Math.min(width, height) * 0.36;

	for (let i = 0; i < ids.length; i++) {
		const angle = (i / Math.max(ids.length, 1)) * Math.PI * 2 + seed * 0.17;
		const r = radius * (0.55 + (i % 5) * 0.08);
		positions.set(ids[i], {
			id: ids[i],
			x: cx + Math.cos(angle) * r,
			y: cy + Math.sin(angle) * r,
			vx: 0,
			vy: 0,
		});
	}

	const idSet = new Set(ids);
	const layoutEdges = edges.filter(e => idSet.has(e.from) && idSet.has(e.to)).slice(0, 200);
	const nodes = [...positions.values()];

	for (let iter = 0; iter < 80; iter++) {
		const alpha = 1 - iter / 80;
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i];
				const b = nodes[j];
				let dx = a.x - b.x;
				let dy = a.y - b.y;
				let dist = Math.hypot(dx, dy) || 1;
				const repulse = (900 * alpha) / dist;
				dx = (dx / dist) * repulse;
				dy = (dy / dist) * repulse;
				a.vx += dx;
				a.vy += dy;
				b.vx -= dx;
				b.vy -= dy;
			}
		}
		for (const e of layoutEdges) {
			const a = positions.get(e.from);
			const b = positions.get(e.to);
			if (!a || !b) {
				continue;
			}
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let dist = Math.hypot(dx, dy) || 1;
			const pull = (dist - 72) * 0.04 * alpha;
			dx = (dx / dist) * pull;
			dy = (dy / dist) * pull;
			a.vx += dx;
			a.vy += dy;
			b.vx -= dx;
			b.vy -= dy;
		}
		for (const n of nodes) {
			n.vx += (cx - n.x) * 0.002 * alpha;
			n.vy += (cy - n.y) * 0.002 * alpha;
			n.vx *= 0.85;
			n.vy *= 0.85;
			n.x += n.vx;
			n.y += n.vy;
			n.x = Math.max(24, Math.min(width - 24, n.x));
			n.y = Math.max(24, Math.min(height - 24, n.y));
		}
	}

	const out = new Map<string, { x: number; y: number }>();
	for (const n of nodes) {
		out.set(n.id, { x: n.x, y: n.y });
	}
	return out;
}
