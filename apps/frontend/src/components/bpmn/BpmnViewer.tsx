'use client';

import { useEffect, useRef } from 'react';
import BpmnJS from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { ensureBpmnLayout } from '@/lib/bpmn-layout';

interface BpmnViewerProps {
  xml: string;
  className?: string;
  highlightedElements?: string[]; // IDs of elements to highlight
  onElementClick?: (elementId: string) => void;
}

export function BpmnViewer({
  xml,
  className = '',
  highlightedElements = [],
  onElementClick,
}: BpmnViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BpmnJS | null>(null);

  useEffect(() => {
    if (!containerRef.current || !xml) return;

    const viewer = new BpmnJS({
      container: containerRef.current,
    });

    viewerRef.current = viewer;

    let cancelled = false;

    ensureBpmnLayout(xml)
      .then((layoutedXml) => {
        if (cancelled) return;
        return viewer.importXML(layoutedXml);
      })
      .then(() => {
        if (cancelled) return;
        const canvas = viewer.get('canvas') as { zoom: (level: string) => void };
        canvas.zoom('fit-viewport');

        // Add click handler
        if (onElementClick) {
          const eventBus = viewer.get('eventBus') as {
            on: (event: string, callback: (e: { element: { id: string } }) => void) => void;
          };
          eventBus.on('element.click', (e) => {
            onElementClick(e.element.id);
          });
        }
      })
      .catch((err: Error) => {
        console.error('Failed to import BPMN for viewing:', err);
      });

    return () => {
      cancelled = true;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [xml, onElementClick]);

  // Highlight elements
  useEffect(() => {
    if (!viewerRef.current || highlightedElements.length === 0) return;

    const canvas = viewerRef.current.get('canvas') as {
      addMarker: (elementId: string, className: string) => void;
      removeMarker: (elementId: string, className: string) => void;
    };

    // Add markers to highlighted elements
    highlightedElements.forEach((elementId) => {
      canvas.addMarker(elementId, 'highlight');
    });

    return () => {
      highlightedElements.forEach((elementId) => {
        canvas.removeMarker(elementId, 'highlight');
      });
    };
  }, [highlightedElements]);

  return (
    <div
      ref={containerRef}
      className={`bpmn-viewer w-full h-full min-h-[300px] bg-gray-50 dark:bg-gray-800 ${className}`}
    />
  );
}

export default BpmnViewer;
