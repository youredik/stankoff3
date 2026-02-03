'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
import { ProcessList } from '@/components/bpmn';
import { bpmnApi } from '@/lib/api/bpmn';
import type { ProcessDefinition, BpmnHealthStatus } from '@/types';

// Dynamic import for ProcessEditor (uses bpmn-js which is browser-only)
const ProcessEditor = dynamic(
  () => import('@/components/bpmn/ProcessEditor').then((mod) => mod.ProcessEditor),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <span className="text-gray-500">Загрузка редактора...</span>
      </div>
    ),
  },
);

export default function ProcessesPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<ProcessDefinition | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [health, setHealth] = useState<BpmnHealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load definitions and health status
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [defs, healthStatus] = await Promise.all([
        bpmnApi.getDefinitions(workspaceId),
        bpmnApi.getHealth(),
      ]);
      setDefinitions(defs);
      setHealth(healthStatus);
    } catch (err) {
      console.error('Failed to load process definitions:', err);
      setError('Не удалось загрузить список процессов');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save new or updated definition
  const handleSave = async (data: {
    name: string;
    description: string;
    processId: string;
    bpmnXml: string;
  }) => {
    try {
      setIsSaving(true);
      const saved = await bpmnApi.createDefinition(workspaceId, data);

      // Update list
      setDefinitions((prev) => {
        const existing = prev.findIndex((d) => d.id === saved.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = saved;
          return updated;
        }
        return [saved, ...prev];
      });

      setSelectedDefinition(saved);
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to save process:', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Deploy definition to Zeebe
  const handleDeploy = async (id?: string) => {
    const defId = id || selectedDefinition?.id;
    if (!defId) return;

    try {
      setIsDeploying(true);
      const deployed = await bpmnApi.deployDefinition(defId);

      // Update list
      setDefinitions((prev) =>
        prev.map((d) => (d.id === deployed.id ? deployed : d)),
      );

      if (selectedDefinition?.id === deployed.id) {
        setSelectedDefinition(deployed);
      }
    } catch (err) {
      console.error('Failed to deploy process:', err);
      alert('Ошибка развертывания. Убедитесь, что Camunda запущена.');
    } finally {
      setIsDeploying(false);
    }
  };

  // Close editor and go back to list
  const handleCloseEditor = () => {
    setSelectedDefinition(null);
    setIsCreating(false);
  };

  const showEditor = isCreating || selectedDefinition;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Бизнес-процессы
            </h1>
          </div>

          {/* Camunda connection status */}
          {health && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                health.connected
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              }`}
            >
              {health.connected ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Camunda подключена
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Camunda недоступна
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {error && (
            <div className="m-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {showEditor ? (
            <ProcessEditor
              initialName={selectedDefinition?.name}
              initialDescription={selectedDefinition?.description}
              initialXml={selectedDefinition?.bpmnXml}
              onSave={handleSave}
              onDeploy={health?.connected ? () => handleDeploy() : undefined}
              onClose={handleCloseEditor}
              isDeployed={!!selectedDefinition?.deployedKey}
              isSaving={isSaving}
              isDeploying={isDeploying}
            />
          ) : (
            <div className="p-6 max-w-4xl mx-auto">
              <ProcessList
                definitions={definitions}
                onSelect={setSelectedDefinition}
                onCreateNew={() => setIsCreating(true)}
                onDeploy={handleDeploy}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
