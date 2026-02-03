'use client';

import { useEffect, useRef, useState } from 'react';
import BpmnJS from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import type { ProcessDefinitionStatistics } from '@/types';

interface BpmnHeatMapProps {
  xml: string;
  statistics?: ProcessDefinitionStatistics | null;
  className?: string;
}

// CSS for heat map overlays
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
  .bpmn-heat-high .djs-visual > :first-child {
    fill: rgba(239, 68, 68, 0.2) !important;
  }
  .bpmn-heat-medium .djs-visual > :first-child {
    fill: rgba(245, 158, 11, 0.2) !important;
  }
  .bpmn-heat-low .djs-visual > :first-child {
    fill: rgba(16, 185, 129, 0.2) !important;
  }
`;

export function BpmnHeatMap({
  xml,
  statistics,
  className = '',
}: BpmnHeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BpmnJS | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Inject heat map styles
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

    const viewer = new BpmnJS({
      container: containerRef.current,
    });

    viewerRef.current = viewer;

    viewer
      .importXML(xml)
      .then(() => {
        const canvas = viewer.get('canvas') as { zoom: (level: string) => void };
        canvas.zoom('fit-viewport');
        setIsReady(true);
      })
      .catch((err: Error) => {
        console.error('Failed to import BPMN for heat map:', err);
      });

    return () => {
      viewer.destroy();
      viewerRef.current = null;
      setIsReady(false);
    };
  }, [xml]);

  // Apply heat map colors based on statistics
  useEffect(() => {
    if (!viewerRef.current || !isReady || !statistics) return;

    const canvas = viewerRef.current.get('canvas') as {
      addMarker: (elementId: string, className: string) => void;
      removeMarker: (elementId: string, className: string) => void;
    };

    const elementRegistry = viewerRef.current.get('elementRegistry') as {
      getAll: () => Array<{ id: string; type: string }>;
    };

    // Get all elements
    const elements = elementRegistry.getAll();

    // Simple visualization based on process statistics
    // In a real implementation, we'd have per-element statistics
    elements.forEach((element) => {
      // Only process flow nodes (not connections)
      if (
        element.type.includes('Task') ||
        element.type.includes('Gateway') ||
        element.type.includes('Event')
      ) {
        // Show active processes
        if (statistics.active > 0) {
          // Highlight start events for active instances
          if (element.type.includes('StartEvent')) {
            canvas.addMarker(element.id, 'bpmn-heat-active');
          }
        }

        // Show incidents
        if (statistics.incident > 0 && element.type.includes('Task')) {
          // In real implementation, we'd know which tasks have incidents
          canvas.addMarker(element.id, 'bpmn-heat-medium');
        }

        // Show completed
        if (statistics.completed > 0 && element.type.includes('EndEvent')) {
          canvas.addMarker(element.id, 'bpmn-heat-completed');
        }
      }
    });
  }, [statistics, isReady]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] bg-white dark:bg-gray-900"
      />

      {/* Legend */}
      {statistics && (
        <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">
            Легенда
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 rounded border-2 border-blue-500" />
              <span className="text-gray-700 dark:text-gray-300">Активные ({statistics.active})</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 rounded border-2 border-green-500" />
              <span className="text-gray-700 dark:text-gray-300">Завершены ({statistics.completed})</span>
            </div>
            {statistics.incident > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-yellow-200 dark:bg-yellow-900/50" />
                <span className="text-gray-700 dark:text-gray-300">Требуют внимания ({statistics.incident})</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BpmnHeatMap;
