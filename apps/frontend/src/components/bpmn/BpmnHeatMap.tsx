'use client';

import { useEffect, useRef, useState } from 'react';
import BpmnJS from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import type { ProcessDefinitionStatistics } from '@/types';
import type { ElementStatItem } from '@/lib/api/processMining';

interface BpmnHeatMapProps {
  xml: string;
  statistics?: ProcessDefinitionStatistics | null;
  elementStats?: { elements: ElementStatItem[] } | null;
  className?: string;
}

function getHeatColor(ratio: number): string {
  // Green (0) → Yellow (0.5) → Red (1)
  const r = Math.round(255 * Math.min(1, ratio * 2));
  const g = Math.round(255 * Math.min(1, (1 - ratio) * 2));
  return `rgb(${r}, ${g}, 0)`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `${ms}мс`;
  if (ms < 60000) return `${Math.round(ms / 1000)}с`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}м`;
  return `${(ms / 3600000).toFixed(1)}ч`;
}

// CSS for fallback heat map markers (process-level stats)
const heatMapStyles = `
  .bpmn-heat-active .djs-visual > :first-child {
    stroke: #3B82F6 !important;
    stroke-width: 3px !important;
  }
  .bpmn-heat-completed .djs-visual > :first-child {
    stroke: #10B981 !important;
    stroke-width: 2px !important;
  }
  .bpmn-heat-incident .djs-visual > :first-child {
    stroke: #EF4444 !important;
    stroke-width: 3px !important;
  }
`;

export function BpmnHeatMap({
  xml,
  statistics,
  elementStats,
  className = '',
}: BpmnHeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BpmnJS | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Inject fallback styles
  useEffect(() => {
    const styleId = 'bpmn-heatmap-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = heatMapStyles;
      document.head.appendChild(style);
    }
  }, []);

  // Initialize viewer
  useEffect(() => {
    if (!containerRef.current || !xml) return;

    const container = containerRef.current;
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 30;

    const initViewer = () => {
      if (cancelled) return;

      if (!container.offsetWidth || !container.offsetHeight) {
        retryCount++;
        if (retryCount < maxRetries) {
          requestAnimationFrame(initViewer);
        }
        return;
      }

      const viewer = new BpmnJS({ container });
      viewerRef.current = viewer;

      viewer
        .importXML(xml)
        .then(() => {
          if (cancelled) {
            viewer.destroy();
            return;
          }
          const canvas = viewer.get('canvas') as { zoom: (level: string) => void };
          canvas.zoom('fit-viewport');
          setIsReady(true);
        })
        .catch((err: Error) => {
          console.error('Failed to import BPMN for heat map:', err);
        });
    };

    requestAnimationFrame(initViewer);

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      setIsReady(false);
    };
  }, [xml]);

  // Apply per-element heat map overlays
  useEffect(() => {
    if (!viewerRef.current || !isReady) return;

    const overlays = viewerRef.current.get('overlays') as {
      add: (elementId: string, type: string, config: Record<string, unknown>) => void;
      remove: (filter: { type: string }) => void;
    };

    // Clear previous overlays
    try {
      overlays.remove({ type: 'heatmap-color' });
      overlays.remove({ type: 'heatmap-badge' });
    } catch {
      // overlays may not exist yet
    }

    if (elementStats && elementStats.elements.length > 0) {
      // Per-element mode
      const maxCount = Math.max(...elementStats.elements.map((e) => e.executionCount), 1);

      for (const el of elementStats.elements) {
        const ratio = el.executionCount / maxCount;
        const color = getHeatColor(ratio);
        const duration = formatDuration(el.avgDurationMs);
        const successRate =
          el.executionCount > 0
            ? Math.round((el.successCount / el.executionCount) * 100)
            : 100;

        try {
          // Color overlay
          overlays.add(el.elementId, 'heatmap-color', {
            position: { top: -4, left: -4 },
            html: `<div style="
              position:absolute; width:calc(100% + 8px); height:calc(100% + 8px);
              background:${color}; opacity:0.25; border-radius:6px; pointer-events:none;
            "></div>`,
          });

          // Badge with count + duration
          const badgeText = duration
            ? `${el.executionCount} | ${duration}`
            : `${el.executionCount}`;
          const badgeBg = successRate < 90 ? '#EF4444' : '#374151';

          overlays.add(el.elementId, 'heatmap-badge', {
            position: { bottom: -2, right: -2 },
            html: `<div style="
              background:${badgeBg}; color:white; padding:1px 5px;
              border-radius:8px; font-size:10px; font-weight:600;
              white-space:nowrap; line-height:16px; pointer-events:auto;
            " title="Выполнений: ${el.executionCount}\nСреднее время: ${duration || '—'}\nУспех: ${successRate}%">${badgeText}</div>`,
          });
        } catch {
          // Element may not be visible in diagram
        }
      }
    } else if (statistics) {
      // Fallback: process-level markers
      const canvas = viewerRef.current.get('canvas') as {
        addMarker: (elementId: string, className: string) => void;
      };
      const elementRegistry = viewerRef.current.get('elementRegistry') as {
        getAll: () => Array<{ id: string; type: string }>;
      };

      const elements = elementRegistry.getAll();
      elements.forEach((element) => {
        if (
          element.type.includes('Task') ||
          element.type.includes('Gateway') ||
          element.type.includes('Event')
        ) {
          if (statistics.active > 0 && element.type.includes('StartEvent')) {
            canvas.addMarker(element.id, 'bpmn-heat-active');
          }
          if (statistics.completed > 0 && element.type.includes('EndEvent')) {
            canvas.addMarker(element.id, 'bpmn-heat-completed');
          }
        }
      });
    }
  }, [elementStats, statistics, isReady]);

  const hasElementData = elementStats && elementStats.elements.length > 0;

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] bg-white dark:bg-gray-900"
      />

      {/* Legend */}
      {(hasElementData || statistics) && (
        <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">
            Легенда
          </p>
          {hasElementData ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className="w-16 h-3 rounded"
                  style={{
                    background:
                      'linear-gradient(to right, rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))',
                  }}
                />
                <span className="text-gray-700 dark:text-gray-300 text-xs">
                  Частота выполнения
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-3 h-3 rounded-full bg-gray-700" />
                <span>Бейдж: кол-во | время</span>
              </div>
            </div>
          ) : (
            statistics && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 rounded border-2 border-blue-500" />
                  <span className="text-gray-700 dark:text-gray-300">
                    Активные ({statistics.active})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 rounded border-2 border-green-500" />
                  <span className="text-gray-700 dark:text-gray-300">
                    Завершены ({statistics.completed})
                  </span>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default BpmnHeatMap;
