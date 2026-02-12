'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Network,
  RefreshCw,
  Maximize2,
  X,
} from 'lucide-react';
import { useAiStore } from '@/store/useAiStore';
import type { GraphNode, GraphEdge, KnowledgeGraphResponse } from '@/types/ai';

interface KnowledgeGraphProps {
  entityId: string;
}

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  entity: { bg: '#0d9488', border: '#0f766e', text: '#ffffff' },
  legacy_request: { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
  expert: { bg: '#22c55e', border: '#16a34a', text: '#ffffff' },
  counterparty: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },
  topic: { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
};

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  radius: number;
}

export function KnowledgeGraph({ entityId }: KnowledgeGraphProps) {
  const data = useAiStore((s) => s.knowledgeGraphCache.get(entityId)?.data ?? null);
  const loading = useAiStore((s) => s.knowledgeGraphLoading.get(entityId) ?? false);
  const fetchKnowledgeGraph = useAiStore((s) => s.fetchKnowledgeGraph);

  const [expanded, setExpanded] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    await fetchKnowledgeGraph(entityId);
  }, [entityId, fetchKnowledgeGraph]);

  const refreshGraph = useCallback(async () => {
    await fetchKnowledgeGraph(entityId, true);
  }, [entityId, fetchKnowledgeGraph]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return null;
  }

  const inlineWidth = 400;
  const inlineHeight = 280;
  const inlineNodes = computeLayout(data.nodes, data.edges, data.centerNodeId, inlineWidth, inlineHeight);

  const legend = (
    <div className="flex flex-wrap items-center gap-3 mt-2 px-1">
      {(['entity', 'legacy_request', 'expert', 'counterparty', 'topic'] as const).map((type) => {
        const hasType = data.nodes.some((n) => n.type === type);
        if (!hasType) return null;
        const colors = NODE_COLORS[type];
        const labels: Record<string, string> = {
          entity: 'Заявка',
          legacy_request: 'Legacy',
          expert: 'Эксперт',
          counterparty: 'Клиент',
          topic: 'Тема',
        };
        return (
          <div key={type} className="flex items-center gap-1">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: colors.bg }}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{labels[type]}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase">
          <Network className="w-3.5 h-3.5 text-purple-500" />
          Граф знаний
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refreshGraph}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Обновить"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Развернуть"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 max-h-[280px]">
        <GraphSvg
          data={data}
          layoutNodes={inlineNodes}
          width={inlineWidth}
          height={inlineHeight}
          hoveredNode={hoveredNode}
          onHoverNode={setHoveredNode}
        />
      </div>

      {legend}

      {/* Fullscreen modal */}
      {expanded && createPortal(
        <GraphModal
          data={data}
          hoveredNode={hoveredNode}
          onHoverNode={setHoveredNode}
          onClose={() => setExpanded(false)}
          onRefresh={refreshGraph}
          legend={legend}
        />,
        document.body,
      )}
    </div>
  );
}

function GraphSvg({
  data,
  layoutNodes,
  width,
  height,
  hoveredNode,
  onHoverNode,
}: {
  data: KnowledgeGraphResponse;
  layoutNodes: LayoutNode[];
  width: number;
  height: number;
  hoveredNode: string | null;
  onHoverNode: (id: string | null) => void;
}) {
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="select-none"
    >
      {/* Edges */}
      {data.edges.map((edge, i) => {
        const source = layoutNodes.find((n) => n.id === edge.source);
        const target = layoutNodes.find((n) => n.id === edge.target);
        if (!source || !target) return null;

        const isHovered = hoveredNode === edge.source || hoveredNode === edge.target;

        return (
          <line
            key={`edge-${i}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={isHovered ? '#0d9488' : '#d1d5db'}
            strokeWidth={isHovered ? 2 : 1}
            strokeOpacity={isHovered ? 0.8 : 0.4}
            strokeDasharray={edge.type === 'related_to' ? '4 2' : undefined}
          />
        );
      })}

      {/* Edge labels */}
      {data.edges.map((edge, i) => {
        if (!edge.label) return null;
        const source = layoutNodes.find((n) => n.id === edge.source);
        const target = layoutNodes.find((n) => n.id === edge.target);
        if (!source || !target) return null;

        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;

        return (
          <text
            key={`label-${i}`}
            x={mx}
            y={my - 4}
            textAnchor="middle"
            className="fill-gray-400 dark:fill-gray-500"
            fontSize={9}
          >
            {edge.label}
          </text>
        );
      })}

      {/* Nodes */}
      {layoutNodes.map((node) => {
        const colors = NODE_COLORS[node.type] || NODE_COLORS.entity;
        const isCenter = node.id === data.centerNodeId;
        const isHovered = hoveredNode === node.id;
        const r = node.radius;

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onMouseEnter={() => onHoverNode(node.id)}
            onMouseLeave={() => onHoverNode(null)}
            className="cursor-pointer"
            onClick={() => {
              const url = node.metadata?.legacyUrl as string;
              if (url) window.open(url, '_blank');
            }}
          >
            <circle
              r={r + (isHovered ? 2 : 0)}
              fill={colors.bg}
              stroke={isCenter ? '#ffffff' : colors.border}
              strokeWidth={isCenter ? 3 : isHovered ? 2 : 1}
              opacity={isHovered ? 1 : 0.9}
            />
            <text
              y={r + 12}
              textAnchor="middle"
              className="fill-gray-700 dark:fill-gray-300"
              fontSize={10}
              fontWeight={isCenter ? 600 : 400}
            >
              {truncateLabel(node.label, 20)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function GraphModal({
  data,
  hoveredNode,
  onHoverNode,
  onClose,
  onRefresh,
  legend,
}: {
  data: KnowledgeGraphResponse;
  hoveredNode: string | null;
  onHoverNode: (id: string | null) => void;
  onClose: () => void;
  onRefresh: () => void;
  legend: React.ReactNode;
}) {
  const modalWidth = 900;
  const modalHeight = 600;
  const layoutNodes = computeLayout(data.nodes, data.edges, data.centerNodeId, modalWidth, modalHeight);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[95vw] max-w-[1100px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Network className="w-4 h-4 text-purple-500" />
            Граф знаний
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Обновить"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Graph */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50">
          <GraphSvg
            data={data}
            layoutNodes={layoutNodes}
            width={modalWidth}
            height={modalHeight}
            hoveredNode={hoveredNode}
            onHoverNode={onHoverNode}
          />
        </div>

        {/* Legend */}
        <div className="px-5 py-2.5 border-t border-gray-200 dark:border-gray-700">
          {legend}
        </div>
      </div>
    </div>
  );
}

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerNodeId: string,
  width: number,
  height: number,
): LayoutNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const layoutNodes: LayoutNode[] = [];

  // Center node
  const centerNode = nodes.find((n) => n.id === centerNodeId);

  // Group by type for better radial layout
  const connectedToCenter = new Set<string>();
  for (const edge of edges) {
    if (edge.source === centerNodeId) connectedToCenter.add(edge.target);
    if (edge.target === centerNodeId) connectedToCenter.add(edge.source);
  }

  const directNodes = nodes.filter((n) => n.id !== centerNodeId && connectedToCenter.has(n.id));
  const indirectNodes = nodes.filter((n) => n.id !== centerNodeId && !connectedToCenter.has(n.id));

  // Place center
  if (centerNode) {
    layoutNodes.push({ ...centerNode, x: cx, y: cy, radius: 18 });
  }

  // Place direct connections in a circle around center
  const radius1 = Math.min(width, height) * 0.28;
  directNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / directNodes.length - Math.PI / 2;
    layoutNodes.push({
      ...node,
      x: cx + radius1 * Math.cos(angle),
      y: cy + radius1 * Math.sin(angle),
      radius: 12,
    });
  });

  // Place indirect connections in outer ring
  const radius2 = Math.min(width, height) * 0.43;
  indirectNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(indirectNodes.length, 1) - Math.PI / 4;
    layoutNodes.push({
      ...node,
      x: cx + radius2 * Math.cos(angle),
      y: cy + radius2 * Math.sin(angle),
      radius: 8,
    });
  });

  return layoutNodes;
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.substring(0, maxLen - 1) + '…';
}
