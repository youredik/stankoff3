'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, CheckCircle, FileCode, Play, BarChart3 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ProcessList, ProcessInstanceList, TemplateSelector } from '@/components/bpmn';
import { bpmnApi } from '@/lib/api/bpmn';
import type { ProcessDefinition, ProcessInstance, BpmnHealthStatus } from '@/types';

// Dynamic imports for browser-only components
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

const ProcessDetailView = dynamic(
  () => import('@/components/bpmn/ProcessDetailView').then((mod) => mod.ProcessDetailView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <span className="text-gray-500">Загрузка...</span>
      </div>
    ),
  },
);

const ProcessMiningDashboard = dynamic(
  () => import('@/components/bpmn/ProcessMiningDashboard').then((mod) => mod.ProcessMiningDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <span className="text-gray-500">Загрузка аналитики...</span>
      </div>
    ),
  },
);

type Tab = 'definitions' | 'instances' | 'analytics';
type ViewMode = 'list' | 'edit' | 'detail';

export default function ProcessesPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>('definitions');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<ProcessDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [health, setHealth] = useState<BpmnHealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [templateData, setTemplateData] = useState<{
    name: string;
    description: string;
    bpmnXml: string;
  } | null>(null);

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

  // Load instances
  const loadInstances = useCallback(async () => {
    try {
      setIsLoadingInstances(true);
      const inst = await bpmnApi.getWorkspaceInstances(workspaceId);
      setInstances(inst);
    } catch (err) {
      console.error('Failed to load instances:', err);
    } finally {
      setIsLoadingInstances(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load instances when tab changes
  useEffect(() => {
    if (activeTab === 'instances') {
      loadInstances();
    }
  }, [activeTab, loadInstances]);

  // Handle selecting a definition - show detail view if deployed, edit view if not
  const handleSelectDefinition = (def: ProcessDefinition) => {
    setSelectedDefinition(def);
    setViewMode(def.deployedKey ? 'detail' : 'edit');
  };

  // Switch to edit mode
  const handleEditDefinition = () => {
    setViewMode('edit');
  };

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
      // Stay in edit mode after save
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
        // Switch to detail view after deploy
        setViewMode('detail');
      }
    } catch (err) {
      console.error('Failed to deploy process:', err);
      alert('Ошибка развертывания. Убедитесь, что Camunda запущена.');
    } finally {
      setIsDeploying(false);
    }
  };

  // Close and go back to list
  const handleBack = () => {
    setSelectedDefinition(null);
    setTemplateData(null);
    setViewMode('list');
  };

  // Create new definition - show template selector first
  const handleCreateNew = () => {
    setShowTemplateSelector(true);
  };

  // Handle template selection
  const handleTemplateSelect = (
    template: { name: string; description: string; bpmnXml: string } | null,
  ) => {
    setShowTemplateSelector(false);
    setSelectedDefinition(null);
    setTemplateData(template);
    setViewMode('edit');
  };

  // Handle closing template selector
  const handleCloseTemplateSelector = () => {
    setShowTemplateSelector(false);
  };

  const showList = viewMode === 'list';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar - only show when in list mode */}
        {showList && (
          <>
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

            {/* Tabs */}
            <div className="flex items-center gap-4 px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('definitions')}
                className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
                  activeTab === 'definitions'
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span className="text-sm font-medium">Определения</span>
                <span className="text-xs text-gray-400">({definitions.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('instances')}
                className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
                  activeTab === 'instances'
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Play className="w-4 h-4" />
                <span className="text-sm font-medium">Экземпляры</span>
                <span className="text-xs text-gray-400">({instances.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
                  activeTab === 'analytics'
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="text-sm font-medium">Аналитика</span>
              </button>
            </div>
          </>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {error && showList && (
            <div className="m-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {viewMode === 'edit' && (
            <ProcessEditor
              initialName={selectedDefinition?.name || templateData?.name}
              initialDescription={selectedDefinition?.description || templateData?.description}
              initialXml={selectedDefinition?.bpmnXml || templateData?.bpmnXml}
              onSave={handleSave}
              onDeploy={health?.connected ? () => handleDeploy() : undefined}
              onClose={handleBack}
              isDeployed={!!selectedDefinition?.deployedKey}
              isSaving={isSaving}
              isDeploying={isDeploying}
            />
          )}

          {viewMode === 'detail' && selectedDefinition && (
            <ProcessDetailView
              definition={selectedDefinition}
              onBack={handleBack}
              onEdit={handleEditDefinition}
              onDeploy={() => handleDeploy()}
              isDeploying={isDeploying}
              canDeploy={health?.connected}
            />
          )}

          {showList && (
            <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full">
              {activeTab === 'definitions' && (
                <ProcessList
                  definitions={definitions}
                  onSelect={handleSelectDefinition}
                  onCreateNew={handleCreateNew}
                  onDeploy={handleDeploy}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'instances' && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Запущенные процессы
                  </h2>
                  <ProcessInstanceList
                    instances={instances}
                    isLoading={isLoadingInstances}
                    emptyMessage="Нет запущенных процессов в этом workspace"
                  />
                </div>
              )}

              {activeTab === 'analytics' && (
                <ProcessMiningDashboard workspaceId={workspaceId} />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Template selector modal */}
      {showTemplateSelector && (
        <TemplateSelector
          onSelect={handleTemplateSelect}
          onClose={handleCloseTemplateSelector}
        />
      )}

      <ToastContainer />
    </div>
  );
}
