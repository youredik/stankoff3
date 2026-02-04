'use client';

import { useState, useCallback } from 'react';
import { Save, Upload, Play, X } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with bpmn-js
const BpmnModeler = dynamic(() => import('./BpmnModeler'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] flex items-center justify-center bg-gray-100 dark:bg-gray-800">
      <span className="text-gray-500">Загрузка редактора...</span>
    </div>
  ),
});

interface ProcessEditorProps {
  initialName?: string;
  initialDescription?: string;
  initialXml?: string;
  onSave: (data: {
    name: string;
    description: string;
    processId: string;
    bpmnXml: string;
  }) => Promise<void>;
  onDeploy?: () => Promise<void>;
  onClose?: () => void;
  isDeployed?: boolean;
  isSaving?: boolean;
  isDeploying?: boolean;
}

export function ProcessEditor({
  initialName = '',
  initialDescription = '',
  initialXml,
  onSave,
  onDeploy,
  onClose,
  isDeployed = false,
  isSaving = false,
  isDeploying = false,
}: ProcessEditorProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [processId, setProcessId] = useState('');
  const [bpmnXml, setBpmnXml] = useState(initialXml || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleXmlChange = useCallback((xml: string) => {
    setBpmnXml(xml);
    setHasChanges(true);
  }, []);

  const handleProcessIdChange = useCallback((id: string) => {
    setProcessId(id);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Введите название процесса');
      return;
    }
    if (!processId) {
      alert('Не удалось определить ID процесса из диаграммы');
      return;
    }
    await onSave({
      name: name.trim(),
      description: description.trim(),
      processId,
      bpmnXml,
    });
    setHasChanges(false);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHasChanges(true);
            }}
            placeholder="Название процесса"
            className="text-lg font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-500 focus:outline-none px-1 py-0.5 min-w-[200px]"
          />
          {isDeployed && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded">
              Развернуто
            </span>
          )}
          {hasChanges && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded">
              Не сохранено
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 rounded-md transition-colors"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
          {onDeploy && (
            <button
              onClick={onDeploy}
              disabled={isDeploying || hasChanges}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
              title={hasChanges ? 'Сначала сохраните изменения' : 'Развернуть в Camunda'}
            >
              <Upload className="w-4 h-4" />
              {isDeploying ? 'Развертывание...' : 'Развернуть'}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setHasChanges(true);
          }}
          placeholder="Описание процесса (необязательно)"
          className="w-full text-sm text-gray-600 dark:text-gray-400 bg-transparent border-none focus:outline-none"
        />
      </div>

      {/* Process ID info */}
      {processId && (
        <div className="px-4 py-1 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
          Process ID: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{processId}</code>
        </div>
      )}

      {/* BPMN Editor */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
          <BpmnModeler
            xml={initialXml}
            onXmlChange={handleXmlChange}
            onProcessIdChange={handleProcessIdChange}
          />
        </div>
      </div>
    </div>
  );
}

export default ProcessEditor;
