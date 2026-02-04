'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type DmnJS from 'dmn-js/lib/Modeler';
import { Save, Download, Upload, ZoomIn, ZoomOut, RotateCcw, Table2 } from 'lucide-react';

// DMN-JS styles
import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn-embedded.css';

// Default empty DMN XML for new diagrams
const EMPTY_DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             id="definitions"
             name="Decision"
             namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="decision_1" name="Decision 1">
    <decisionTable id="decisionTable_1" hitPolicy="FIRST">
      <input id="input_1" label="Input">
        <inputExpression id="inputExpression_1" typeRef="string">
          <text>input</text>
        </inputExpression>
      </input>
      <output id="output_1" label="Output" typeRef="string" />
      <rule id="rule_1">
        <inputEntry id="inputEntry_1"><text></text></inputEntry>
        <outputEntry id="outputEntry_1"><text></text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_1">
      <dmndi:DMNShape id="DMNShape_decision_1" dmnElementRef="decision_1">
        <dc:Bounds height="80" width="180" x="150" y="80" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;

interface DmnModelerProps {
  xml?: string;
  onChange?: (xml: string) => void;
  onSave?: (xml: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function DmnModeler({
  xml,
  onChange,
  onSave,
  readOnly = false,
  className = '',
}: DmnModelerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<DmnJS | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'drd' | 'decisionTable'>('decisionTable');

  // Initialize modeler
  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const initModeler = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const DmnModelerClass = (await import('dmn-js/lib/Modeler')).default;

        if (!mounted || !containerRef.current) return;

        const modeler = new DmnModelerClass({
          container: containerRef.current,
          keyboard: { bindTo: document },
          drd: {
            additionalModules: [],
          },
          decisionTable: {
            additionalModules: [],
          },
        });

        modelerRef.current = modeler;

        // Import XML
        const dmnXml = xml || EMPTY_DMN;
        await modeler.importXML(dmnXml);

        // Get views and show decision table by default
        const views = modeler.getViews();
        const tableView = views.find((v: { type: string }) => v.type === 'decisionTable');
        if (tableView) {
          modeler.open(tableView);
        }

        // Listen for changes
        if (!readOnly && onChange) {
          modeler.on('commandStack.changed', async () => {
            try {
              const { xml: newXml } = await modeler.saveXML({ format: true });
              onChange(newXml);
            } catch (err) {
              console.error('Failed to get XML:', err);
            }
          });
        }

        setIsLoaded(true);
        setError(null);
      } catch (err) {
        console.error('Failed to initialize DMN modeler:', err);
        setError('Failed to initialize DMN editor');
      }
    };

    initModeler();

    return () => {
      mounted = false;
      if (modelerRef.current) {
        modelerRef.current.destroy();
        modelerRef.current = null;
      }
    };
  }, [readOnly]);

  // Update XML when prop changes
  useEffect(() => {
    if (!modelerRef.current || !isLoaded) return;

    const updateXml = async () => {
      try {
        const currentXml = (await modelerRef.current!.saveXML({ format: true })).xml;
        if (xml && xml !== currentXml) {
          await modelerRef.current!.importXML(xml);
        }
      } catch (err) {
        console.error('Failed to update XML:', err);
      }
    };

    updateXml();
  }, [xml, isLoaded]);

  const handleSave = useCallback(async () => {
    if (!modelerRef.current || !onSave) return;

    try {
      const { xml: savedXml } = await modelerRef.current.saveXML({ format: true });
      onSave(savedXml);
    } catch (err) {
      console.error('Failed to save DMN:', err);
      setError('Failed to save');
    }
  }, [onSave]);

  const handleExport = useCallback(async () => {
    if (!modelerRef.current) return;

    try {
      const { xml: exportXml } = await modelerRef.current.saveXML({ format: true });
      const blob = new Blob([exportXml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'decision.dmn';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export DMN:', err);
    }
  }, []);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !modelerRef.current) return;

    try {
      const text = await file.text();
      await modelerRef.current.importXML(text);
      if (onChange) {
        onChange(text);
      }
    } catch (err) {
      console.error('Failed to import DMN:', err);
      setError('Failed to import DMN file');
    }
  }, [onChange]);

  const handleZoomIn = useCallback(() => {
    const activeViewer = modelerRef.current?.getActiveViewer();
    if (activeViewer?.get) {
      try {
        const canvas = activeViewer.get('canvas');
        canvas.zoom(canvas.zoom() * 1.2);
      } catch {
        // Zoom not supported for this view
      }
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const activeViewer = modelerRef.current?.getActiveViewer();
    if (activeViewer?.get) {
      try {
        const canvas = activeViewer.get('canvas');
        canvas.zoom(canvas.zoom() / 1.2);
      } catch {
        // Zoom not supported for this view
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    const activeViewer = modelerRef.current?.getActiveViewer();
    if (activeViewer?.get) {
      try {
        const canvas = activeViewer.get('canvas');
        canvas.zoom('fit-viewport');
      } catch {
        // Reset not supported for this view
      }
    }
  }, []);

  const handleSwitchView = useCallback((viewType: 'drd' | 'decisionTable') => {
    if (!modelerRef.current) return;

    const views = modelerRef.current.getViews();
    const targetView = views.find((v: { type: string }) => v.type === viewType);
    if (targetView) {
      modelerRef.current.open(targetView);
      setActiveView(viewType);
    }
  }, []);

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSwitchView('decisionTable')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeView === 'decisionTable'
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Table2 className="w-4 h-4" />
            Таблица
          </button>
          <button
            onClick={() => handleSwitchView('drd')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeView === 'drd'
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="8" height="6" rx="1" />
              <rect x="13" y="15" width="8" height="6" rx="1" />
              <path d="M7 9v3a2 2 0 002 2h6a2 2 0 012 2v-1" />
            </svg>
            DRD
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          <label className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
            <Upload className="w-4 h-4" />
            <input type="file" accept=".dmn,.xml" onChange={handleImport} className="hidden" />
          </label>
          <button
            onClick={handleExport}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Export DMN"
          >
            <Download className="w-4 h-4" />
          </button>

          {onSave && !readOnly && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              <Save className="w-4 h-4" />
              Сохранить
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Modeler container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ minHeight: '400px' }}
      />

      {/* Loading overlay */}
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading DMN editor...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default DmnModeler;
