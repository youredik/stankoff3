'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import BpmnJS from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
  ZeebePropertiesProviderModule,
} from 'bpmn-js-properties-panel';
import zeebeModdle from 'zeebe-bpmn-moddle/resources/zeebe.json';
import camundaCloudBehaviors from 'camunda-bpmn-js-behaviors/lib/camunda-cloud';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import { ensureBpmnLayout } from '@/lib/bpmn-layout';
import { createFormKeyProviderModule, type FormOption } from './FormKeyPropertiesProvider';
import { getFormDefinitions } from '@/lib/api/forms';

// Default empty BPMN diagram with Zeebe namespace
const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="Stankoff Portal"
  exporterVersion="1.0.0">
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
  workspaceId?: string;
  onXmlChange?: (xml: string) => void;
  onProcessIdChange?: (processId: string) => void;
  className?: string;
}

export function BpmnModeler({
  xml,
  workspaceId,
  onXmlChange,
  onProcessIdChange,
  className = '',
}: BpmnModelerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const propertiesPanelRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnJS | null>(null);
  const loadedXmlRef = useRef<string | null>(null);
  const formsRef = useRef<FormOption[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Load workspace form definitions for form key dropdown
  useEffect(() => {
    if (!workspaceId) {
      formsRef.current = [];
      return;
    }
    getFormDefinitions(workspaceId)
      .then((forms) => {
        formsRef.current = forms
          .filter((f) => f.isActive)
          .map((f) => ({ key: f.key, name: f.name }));
      })
      .catch((err) => {
        console.warn('Failed to load form definitions:', err);
        formsRef.current = [];
      });
  }, [workspaceId]);

  // Initialize modeler
  useEffect(() => {
    if (!canvasRef.current || !propertiesPanelRef.current) return;

    // Wait for container to have dimensions
    const container = canvasRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
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
      propertiesPanel: {
        parent: propertiesPanelRef.current,
      },
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        ZeebePropertiesProviderModule,
        camundaCloudBehaviors,
        ...(workspaceId ? [createFormKeyProviderModule(formsRef)] : []),
      ],
      moddleExtensions: {
        zeebe: zeebeModdle,
      },
    });

    modelerRef.current = modeler;
    let isDestroyed = false;

    // Load initial diagram with auto-layout for incomplete BPMNDI
    const initialXml = xml || EMPTY_BPMN;

    ensureBpmnLayout(initialXml)
      .then((layoutedXml) => {
        if (isDestroyed) return;
        return modeler.importXML(layoutedXml);
      })
      .then(() => {
        if (isDestroyed || modelerRef.current !== modeler) return;

        loadedXmlRef.current = initialXml;
        setIsReady(true);
        const canvas = modeler.get('canvas') as { zoom: (level: string) => void };
        canvas.zoom('fit-viewport');

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
    if (loadedXmlRef.current === xml) return;

    ensureBpmnLayout(xml).then((layoutedXml) => {
      return modelerRef.current!.importXML(layoutedXml);
    }).then(() => {
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

  // Expose methods via wrapper ref
  useEffect(() => {
    if (wrapperRef.current) {
      const el = wrapperRef.current as HTMLDivElement & { exportXml: typeof exportXml; exportSvg: typeof exportSvg };
      el.exportXml = exportXml;
      el.exportSvg = exportSvg;
    }
  }, [exportXml, exportSvg]);

  return (
    <div
      ref={wrapperRef}
      style={{ height: '100%', minHeight: '500px' }}
      className={`bpmn-modeler flex w-full bg-white dark:bg-gray-900 ${className}`}
    >
      {/* BPMN Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 min-w-0 h-full"
      />

      {/* Toggle button */}
      <button
        onClick={() => setPanelCollapsed((c) => !c)}
        className="flex-none w-6 h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 text-xs transition-colors"
        title={panelCollapsed ? 'Показать свойства' : 'Скрыть свойства'}
      >
        {panelCollapsed ? '\u25C0' : '\u25B6'}
      </button>

      {/* Properties Panel */}
      <div
        ref={propertiesPanelRef}
        className={`flex-none h-full overflow-y-auto border-l border-gray-200 dark:border-gray-700 transition-all ${
          panelCollapsed ? 'w-0 overflow-hidden' : 'w-[320px]'
        }`}
      />
    </div>
  );
}

export default BpmnModeler;
