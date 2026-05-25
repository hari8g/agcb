/*--------------------------------------------------------------------------------------
 *  Agentic AI — temporal codebase knowledge graph visualization (ZAP-style)
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
	KnowledgeGraphEdge,
	KnowledgeGraphNode,
	TemporalKnowledgeGraph,
} from '../../../../common/codebaseKnowledgeGraph.js';
import {
	getKnowledgeGraphService,
	useHasWorkspace,
	useKnowledgeGraph,
} from '../util/agenticServices.js';
import { computeForceLayout } from '../util/graphLayout.js';

const NODE_RADIUS: Record<KnowledgeGraphNode['kind'], number> = {
	workspace: 14,
	package: 10,
	directory: 9,
	file: 7,
};

const NODE_FILL: Record<KnowledgeGraphNode['kind'], string> = {
	workspace: '#3b82f6',
	package: '#8b5cf6',
	directory: '#22c55e',
	file: '#f97316',
};

const EDGE_STROKE: Record<KnowledgeGraphEdge['kind'], string> = {
	contains: 'rgba(120,120,130,0.45)',
	imports: 'rgba(239,68,68,0.65)',
	related: 'rgba(59,130,246,0.5)',
};

function formatWhen(ts: number): string {
	try {
		return new Date(ts).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	} catch {
		return String(ts);
	}
}

function nodeKindLabel(kind: KnowledgeGraphNode['kind']): string {
	switch (kind) {
		case 'workspace': return 'Workspace';
		case 'package': return 'Package';
		case 'directory': return 'Directory';
		case 'file': return 'File';
	}
}

function edgeKindLabel(kind: KnowledgeGraphEdge['kind']): string {
	switch (kind) {
		case 'contains': return 'CONTAINS';
		case 'imports': return 'IMPORTS';
		case 'related': return 'RELATED';
	}
}

function NodeDetails({
	node,
	kg,
	edges,
	onClose,
}: {
	node: KnowledgeGraphNode;
	kg: TemporalKnowledgeGraph;
	edges: KnowledgeGraphEdge[];
	onClose: () => void;
}) {
	const connected = edges.filter(e => e.from === node.id || e.to === node.id).slice(0, 12);
	const areas = node.kind === 'workspace' ? kg.areas.slice(0, 6) : [];

	return (
		<aside className="agentic-kg-details" role="dialog" aria-label="Node details">
			<div className="agentic-kg-details__head">
				<h3>Node Details</h3>
				<span className={`agentic-kg-details__kind agentic-kg-details__kind--${node.kind}`}>
					{nodeKindLabel(node.kind)}
				</span>
				<button type="button" className="agentic-kg-details__close" onClick={onClose} aria-label="Close">
					×
				</button>
			</div>
			<dl className="agentic-kg-details__list">
				<div><dt>Name</dt><dd>{node.label}</dd></div>
				<div><dt>ID</dt><dd className="agentic-kg-details__mono">{node.id}</dd></div>
				{node.path && <div><dt>Path</dt><dd className="agentic-kg-details__mono">{node.path}</dd></div>}
				{node.role && <div><dt>Role</dt><dd>{node.role}</dd></div>}
				<div><dt>Graph updated</dt><dd>{formatWhen(kg.generatedAt)}</dd></div>
				{kg.revision != null && <div><dt>Revision</dt><dd>{kg.revision}</dd></div>}
			</dl>
			{areas.length > 0 && (
				<section className="agentic-kg-details__section">
					<h4>Repository areas</h4>
					<ul>{areas.map(a => <li key={a}>{a}</li>)}</ul>
				</section>
			)}
			{connected.length > 0 && (
				<section className="agentic-kg-details__section">
					<h4>Relationships</h4>
					<ul className="agentic-kg-details__rels">
						{connected.map((e, i) => (
							<li key={`${e.from}-${e.to}-${e.kind}-${i}`}>
								<span className="agentic-kg-details__edge-kind">{edgeKindLabel(e.kind)}</span>
								<span>{e.from === node.id ? `→ ${e.to}` : `← ${e.from}`}</span>
							</li>
						))}
					</ul>
				</section>
			)}
			<div className="agentic-kg-details__labels">
				<span className="agentic-kg-details__pill">Entity</span>
				<span className="agentic-kg-details__pill">{nodeKindLabel(node.kind)}</span>
			</div>
		</aside>
	);
}

export function CodebaseGraphPanel() {
	const hasWorkspace = useHasWorkspace();
	const { graph, loading, error } = useKnowledgeGraph();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 640, h: 420 });

	useEffect(() => {
		const el = wrapRef.current;
		if (!el || typeof ResizeObserver === 'undefined') {
			return;
		}
		const ro = new ResizeObserver(entries => {
			const cr = entries[0]?.contentRect;
			if (cr) {
				setSize({ w: Math.max(320, cr.width), h: Math.max(280, cr.height) });
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await getKnowledgeGraphService().getOrBuild('', { forceRefresh: true });
		} finally {
			setRefreshing(false);
		}
	}, []);

	const layout = useMemo(() => {
		if (!graph) {
			return null;
		}
		const nodeIds = graph.nodes.map(n => n.id);
		const simpleEdges = graph.edges.map(e => ({ from: e.from, to: e.to }));
		return computeForceLayout(nodeIds, simpleEdges, size.w, size.h, graph.revision ?? 1);
	}, [graph, size.w, size.h]);

	const selectedNode = graph?.nodes.find(n => n.id === selectedId) ?? null;

	if (!hasWorkspace) {
		return (
			<div className="agentic-kg-root agentic-kg-root--empty">
				<p>Open a folder to map the codebase knowledge graph.</p>
			</div>
		);
	}

	return (
		<div
			className={`agentic-kg-root${fullscreen ? ' agentic-kg-root--fullscreen' : ''}`}
			ref={wrapRef}
		>
			<header className="agentic-kg-header">
				<div>
					<h2 className="agentic-kg-header__title">Codebase Knowledge Graph</h2>
					<p className="agentic-kg-header__sub">
						Entities, imports, and structure — learns over time as the repo is scanned
					</p>
				</div>
				<div className="agentic-kg-header__actions">
					<button
						type="button"
						className="agentic-btn agentic-btn-ghost agentic-btn--sm"
						disabled={refreshing || loading}
						onClick={() => void refresh()}
					>
						{refreshing || loading ? 'Refreshing…' : 'Refresh'}
					</button>
					<button
						type="button"
						className="agentic-btn agentic-btn-ghost agentic-btn--sm"
						onClick={() => setFullscreen(f => !f)}
						title={fullscreen ? 'Exit full screen' : 'Full screen'}
					>
						{fullscreen ? 'Exit' : 'Full screen'}
					</button>
				</div>
			</header>

			{error && <div className="agentic-kg-error">{error}</div>}

			<div className="agentic-kg-canvas-wrap">
				{!graph && loading && (
					<div className="agentic-kg-loading">Mapping repository structure…</div>
				)}
				{graph && layout && (
					<svg
						className="agentic-kg-svg"
						width={size.w}
						height={size.h}
						viewBox={`0 0 ${size.w} ${size.h}`}
						role="img"
						aria-label="Codebase relationship graph"
					>
						<defs>
							<pattern id="agentic-kg-grid" width="24" height="24" patternUnits="userSpaceOnUse">
								<path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(128,128,128,0.12)" strokeWidth="1" />
							</pattern>
						</defs>
						<rect width="100%" height="100%" fill="url(#agentic-kg-grid)" />
						{graph.edges.map((e, i) => {
							const from = layout.get(e.from);
							const to = layout.get(e.to);
							if (!from || !to) {
								return null;
							}
							const midX = (from.x + to.x) / 2;
							const midY = (from.y + to.y) / 2;
							const showLabel = e.kind === 'imports' && i % 3 === 0;
							return (
								<g key={`${e.from}-${e.to}-${e.kind}-${i}`}>
									<line
										x1={from.x}
										y1={from.y}
										x2={to.x}
										y2={to.y}
										stroke={EDGE_STROKE[e.kind]}
										strokeWidth={e.kind === 'imports' ? 1.2 : 0.9}
										strokeDasharray={e.kind === 'related' ? '4 3' : undefined}
									/>
									{showLabel && (
										<text
											x={midX}
											y={midY}
											className="agentic-kg-edge-label"
											textAnchor="middle"
										>
											{edgeKindLabel(e.kind)}
										</text>
									)}
								</g>
							);
						})}
						{graph.nodes.map(n => {
							const pos = layout.get(n.id);
							if (!pos) {
								return null;
							}
							const r = NODE_RADIUS[n.kind];
							const active = selectedId === n.id;
							return (
								<g
									key={n.id}
									className={`agentic-kg-node${active ? ' agentic-kg-node--active' : ''}`}
									style={{ cursor: 'pointer' }}
									onClick={() => setSelectedId(n.id)}
								>
									<circle
										cx={pos.x}
										cy={pos.y}
										r={r + (active ? 3 : 0)}
										fill={NODE_FILL[n.kind]}
										stroke={active ? '#fff' : 'rgba(0,0,0,0.2)'}
										strokeWidth={active ? 2 : 1}
									/>
									{(n.kind === 'workspace' || n.kind === 'directory' || active) && (
										<text x={pos.x} y={pos.y + r + 12} className="agentic-kg-node-label" textAnchor="middle">
											{n.label.length > 28 ? `${n.label.slice(0, 26)}…` : n.label}
										</text>
									)}
								</g>
							);
						})}
					</svg>
				)}
				{selectedNode && graph && (
					<NodeDetails
						node={selectedNode}
						kg={graph}
						edges={graph.edges}
						onClose={() => setSelectedId(null)}
					/>
				)}
			</div>

			{graph && (
				<footer className="agentic-kg-footer">
					<span>{graph.nodes.length} nodes</span>
					<span>{graph.edges.length} edges</span>
					<span>Updated {formatWhen(graph.generatedAt)}</span>
					{graph.revision != null && <span>Rev {graph.revision}</span>}
					{(graph.history?.length ?? 0) > 1 && (
						<span className="agentic-kg-footer__learn">
							Learning +{((graph.history?.at(-1)?.nodeCount ?? 0) - (graph.history?.[0]?.nodeCount ?? 0))} nodes
						</span>
					)}
				</footer>
			)}
		</div>
	);
}
