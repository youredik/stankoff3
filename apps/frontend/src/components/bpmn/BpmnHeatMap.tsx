'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import BpmnJS from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { ensureBpmnLayout } from '@/lib/bpmn-layout';
import type { ProcessDefinitionStatistics } from '@/types';
import type { ElementStatItem } from '@/lib/api/processMining';

interface BpmnHeatMapProps {
  xml: string;
  statistics?: ProcessDefinitionStatistics | null;
  elementStats?: { elements: ElementStatItem[] } | null;
  className?: string;
}

// Heat color: blue (cold) → green → yellow → red (hot)
function getHeatRGBA(ratio: number, alpha: number): string {
  // 0.0 = cool blue/green, 0.5 = warm yellow, 1.0 = hot red
  let r: number, g: number, b: number;
  if (ratio < 0.25) {
    // Blue → Cyan
    const t = ratio / 0.25;
    r = 0;
    g = Math.round(180 * t);
    b = Math.round(220 * (1 - t * 0.5));
  } else if (ratio < 0.5) {
    // Cyan → Green
    const t = (ratio - 0.25) / 0.25;
    r = 0;
    g = Math.round(180 + 75 * t);
    b = Math.round(110 * (1 - t));
  } else if (ratio < 0.75) {
    // Green → Yellow
    const t = (ratio - 0.5) / 0.25;
    r = Math.round(255 * t);
    g = 255;
    b = 0;
  } else {
    // Yellow → Red
    const t = (ratio - 0.75) / 0.25;
    r = 255;
    g = Math.round(255 * (1 - t));
    b = 0;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Simpler green → yellow → red for badges
function getBadgeColor(ratio: number): string {
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

interface BpmnElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  inner: { x: number; y: number; width: number; height: number };
  outer: { width: number; height: number };
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

/**
 * Draw gaussian heat map on canvas overlay.
 * Each element gets a radial gradient centered on it, with radius proportional
 * to the element size and intensity proportional to execution count.
 */
function drawHeatMapCanvas(
  canvas: HTMLCanvasElement,
  elements: { el: BpmnElement; ratio: number }[],
  viewBox: ViewBox,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Map BPMN coordinates → canvas pixel coordinates
  const scale = viewBox.scale;
  const toX = (bpmnX: number) => (bpmnX - viewBox.x) * scale;
  const toY = (bpmnY: number) => (bpmnY - viewBox.y) * scale;

  // Draw radial gradients for each element
  for (const { el, ratio } of elements) {
    const cx = toX(el.x + el.width / 2);
    const cy = toY(el.y + el.height / 2);
    const baseRadius = Math.max(el.width, el.height) * scale;
    // Aura ~1.0–1.6x element size, hotter = slightly bigger
    const radius = baseRadius * (1.0 + ratio * 0.6);

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    // Moderate opacity: visible glow without overwhelming the diagram
    const centerAlpha = 0.25 + ratio * 0.2;
    gradient.addColorStop(0, getHeatRGBA(ratio, centerAlpha));
    gradient.addColorStop(0.35, getHeatRGBA(ratio, centerAlpha * 0.6));
    gradient.addColorStop(0.6, getHeatRGBA(ratio, centerAlpha * 0.25));
    gradient.addColorStop(0.85, getHeatRGBA(ratio, centerAlpha * 0.06));
    gradient.addColorStop(1, getHeatRGBA(ratio, 0));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function BpmnHeatMap({
  xml,
  statistics,
  elementStats,
  className = '',
}: BpmnHeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<BpmnJS | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showBadges, setShowBadges] = useState(true);

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

    const initViewer = async () => {
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

      try {
        const layoutedXml = await ensureBpmnLayout(xml);
        if (cancelled) {
          viewer.destroy();
          return;
        }
        await viewer.importXML(layoutedXml);
        if (cancelled) {
          viewer.destroy();
          return;
        }
        const bpmnCanvas = viewer.get('canvas') as { zoom: (level: string) => void };
        bpmnCanvas.zoom('fit-viewport');
        setIsReady(true);
      } catch (err) {
        console.error('Failed to import BPMN for heat map:', err);
      }
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

  // Redraw heat canvas when viewer changes (zoom/pan)
  const redrawHeatCanvas = useCallback(() => {
    if (!viewerRef.current || !canvasRef.current || !elementStats?.elements.length) return;

    const bpmnCanvas = viewerRef.current.get('canvas') as {
      viewbox: () => ViewBox;
    };
    const elementRegistry = viewerRef.current.get('elementRegistry') as {
      get: (id: string) => BpmnElement | undefined;
    };

    const viewBox = bpmnCanvas.viewbox();
    const maxCount = Math.max(...elementStats.elements.map((e) => e.executionCount), 1);

    const mappedElements: { el: BpmnElement; ratio: number }[] = [];
    for (const stat of elementStats.elements) {
      const el = elementRegistry.get(stat.elementId);
      if (el && el.width && el.height) {
        mappedElements.push({
          el,
          ratio: stat.executionCount / maxCount,
        });
      }
    }

    drawHeatMapCanvas(canvasRef.current, mappedElements, viewBox);
  }, [elementStats]);

  // Apply heat map canvas + badge overlays
  useEffect(() => {
    if (!viewerRef.current || !isReady) return;

    const overlays = viewerRef.current.get('overlays') as {
      add: (elementId: string, type: string, config: Record<string, unknown>) => void;
      remove: (filter: { type: string }) => void;
    };

    // Clear previous overlays
    try {
      overlays.remove({ type: 'heatmap-badge' });
    } catch {
      // ignore
    }

    if (elementStats && elementStats.elements.length > 0) {
      // Draw canvas heat map
      redrawHeatCanvas();

      // Subscribe to canvas viewport changes for redraw
      const eventBus = viewerRef.current.get('eventBus') as {
        on: (event: string, callback: () => void) => void;
        off: (event: string, callback: () => void) => void;
      };
      eventBus.on('canvas.viewbox.changed', redrawHeatCanvas);

      // Add badge overlays
      if (showBadges) {
        const maxCount = Math.max(...elementStats.elements.map((e) => e.executionCount), 1);

        for (const el of elementStats.elements) {
          const ratio = el.executionCount / maxCount;
          const duration = formatDuration(el.avgDurationMs);
          const successRate =
            el.executionCount > 0
              ? Math.round((el.successCount / el.executionCount) * 100)
              : 100;

          try {
            const badgeText = duration
              ? `${el.executionCount} | ${duration}`
              : `${el.executionCount}`;
            const badgeBg = successRate < 90 ? '#EF4444' : '#374151';
            const borderColor = getBadgeColor(ratio);

            overlays.add(el.elementId, 'heatmap-badge', {
              position: { bottom: -2, right: -2 },
              html: `<div style="
                background:${badgeBg}; color:white; padding:1px 6px;
                border-radius:8px; font-size:10px; font-weight:600;
                white-space:nowrap; line-height:16px; pointer-events:auto;
                border: 2px solid ${borderColor};
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              " title="Выполнений: ${el.executionCount}\nСреднее время: ${duration || '—'}\nУспех: ${successRate}%">${badgeText}</div>`,
            });
          } catch {
            // Element may not be visible
          }
        }
      }

      return () => {
        eventBus.off('canvas.viewbox.changed', redrawHeatCanvas);
      };
    } else if (statistics) {
      // Fallback: process-level markers
      const bpmnCanvas = viewerRef.current.get('canvas') as {
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
            bpmnCanvas.addMarker(element.id, 'bpmn-heat-active');
          }
          if (statistics.completed > 0 && element.type.includes('EndEvent')) {
            bpmnCanvas.addMarker(element.id, 'bpmn-heat-completed');
          }
        }
      });
    }
  }, [elementStats, statistics, isReady, showBadges, redrawHeatCanvas]);

  const hasElementData = elementStats && elementStats.elements.length > 0;

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] bg-white dark:bg-gray-900"
      />

      {/* Canvas overlay for gaussian heat effect */}
      {hasElementData && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ filter: 'blur(22px)' }}
        />
      )}

      {/* Controls */}
      {hasElementData && (
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => setShowBadges((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg shadow-md transition-colors ${
              showBadges
                ? 'bg-gray-800 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
            }`}
          >
            {showBadges ? 'Скрыть числа' : 'Показать числа'}
          </button>
        </div>
      )}

      {/* Legend */}
      {(hasElementData || statistics) && (
        <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">
            Тепловая карта
          </p>
          {hasElementData ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className="w-20 h-3 rounded-sm"
                  style={{
                    background:
                      'linear-gradient(to right, rgba(0,180,220,0.8), rgba(0,255,0,0.8), rgba(255,255,0,0.8), rgba(255,0,0,0.9))',
                  }}
                />
                <span className="text-gray-700 dark:text-gray-300 text-xs">
                  Частота выполнения
                </span>
              </div>
              {showBadges && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="w-3 h-3 rounded-full bg-gray-700 border border-yellow-400" />
                  <span>Бейдж: количество | время</span>
                </div>
              )}
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
