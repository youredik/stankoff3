'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import BpmnJS from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

// Default empty BPMN diagram
const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Начало"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="176" y="203" width="44" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

interface BpmnModelerProps {
  xml?: string;
  onXmlChange?: (xml: string) => void;
  onProcessIdChange?: (processId: string) => void;
  className?: string;
}

export function BpmnModeler({
  xml,
  onXmlChange,
  onProcessIdChange,
  className = '',
}: BpmnModelerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnJS | null>(null);
  const loadedXmlRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Initialize modeler
  useEffect(() => {
    if (!containerRef.current) return;

    // Wait for container to have dimensions
    const container = containerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      // Retry after a short delay if container has no dimensions yet
      if (retryCount < 10) {
        const timeoutId = setTimeout(() => {
          setRetryCount((c) => c + 1);
        }, 100);
        return () => clearTimeout(timeoutId);
      }
      return;
    }

    const modeler = new BpmnJS({
      container,
    });

    modelerRef.current = modeler;
    let isDestroyed = false;

    // Load initial diagram
    const initialXml = xml || EMPTY_BPMN;

    modeler
      .importXML(initialXml)
      .then(() => {
        // Check if modeler was destroyed during async import
        if (isDestroyed || modelerRef.current !== modeler) return;

        loadedXmlRef.current = initialXml;
        setIsReady(true);
        // Fit to viewport
        const canvas = modeler.get('canvas') as { zoom: (level: string) => void };
        canvas.zoom('fit-viewport');

        // Extract process ID
        if (onProcessIdChange) {
          const definitions = modeler.getDefinitions();
          const process = definitions?.rootElements?.find(
            (el: { $type: string }) => el.$type === 'bpmn:Process',
          );
          if (process?.id) {
            onProcessIdChange(process.id);
          }
        }
      })
      .catch((err: Error) => {
        // Ignore errors if modeler was destroyed
        if (isDestroyed) return;
        console.error('Failed to import BPMN:', err);
      });

    // Listen to changes
    modeler.on('commandStack.changed', () => {
      if (isDestroyed) return;
      if (onXmlChange) {
        modeler.saveXML({ format: true }).then(({ xml: newXml }) => {
          if (newXml && !isDestroyed) {
            onXmlChange(newXml);
          }
        });
      }
      // Update process ID on changes
      if (onProcessIdChange) {
        const definitions = modeler.getDefinitions();
        const process = definitions?.rootElements?.find(
          (el: { $type: string }) => el.$type === 'bpmn:Process',
        );
        if (process?.id) {
          onProcessIdChange(process.id);
        }
      }
    });

    return () => {
      isDestroyed = true;
      modeler.destroy();
      modelerRef.current = null;
      loadedXmlRef.current = null;
      setIsReady(false);
    };
  }, [retryCount]); // Re-run when retrying

  // Update XML when prop changes (but skip if same XML already loaded)
  useEffect(() => {
    if (!modelerRef.current || !isReady || !xml) return;
    // Skip if this XML was already loaded
    if (loadedXmlRef.current === xml) return;

    modelerRef.current.importXML(xml).then(() => {
      loadedXmlRef.current = xml;
    }).catch((err: Error) => {
      console.error('Failed to update BPMN:', err);
    });
  }, [xml, isReady]);

  // Export current XML
  const exportXml = useCallback(async (): Promise<string | null> => {
    if (!modelerRef.current) return null;
    const { xml: exportedXml } = await modelerRef.current.saveXML({ format: true });
    return exportedXml || null;
  }, []);

  // Export as SVG
  const exportSvg = useCallback(async (): Promise<string | null> => {
    if (!modelerRef.current) return null;
    const { svg } = await modelerRef.current.saveSVG();
    return svg || null;
  }, []);

  // Expose methods via ref
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as HTMLDivElement & { exportXml: typeof exportXml; exportSvg: typeof exportSvg }).exportXml = exportXml;
      (containerRef.current as HTMLDivElement & { exportXml: typeof exportXml; exportSvg: typeof exportSvg }).exportSvg = exportSvg;
    }
  }, [exportXml, exportSvg]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', minHeight: '500px' }}
      className={`bpmn-modeler w-full bg-white dark:bg-gray-900 ${className}`}
    />
  );
}

export default BpmnModeler;
