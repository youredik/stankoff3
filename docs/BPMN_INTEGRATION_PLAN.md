# План интеграции Camunda 8.8 + BPMN 2.0

**Дата создания:** 2026-02-03
**Обновлено:** 2026-02-08
**Статус:** Все фазы (1-6) реализованы
**Оценка:** 3-4 недели (с официальным пакетом)

---

## 0. Официальный пакет Camunda 8.8

Используем официальные артефакты из `camunda-8.8/` (версия 8.8.9):

```
camunda-8.8/
├── docker-compose.yaml           # Lightweight: orchestration + elasticsearch
├── docker-compose-full.yaml      # Full: + optimize, web-modeler, console, identity
├── docker-compose-web-modeler.yaml  # Standalone web modeler
├── .env                          # Версии и настройки
└── .orchestration/               # Конфиги сервисов
```

### Версии компонентов
| Компонент | Версия |
|-----------|--------|
| Camunda (Zeebe+Operate+Tasklist) | 8.8.9 |
| Web Modeler | 8.8.5 |
| Optimize | 8.8.4 |
| Elasticsearch | 8.17.10 |
| Connectors | 8.8.5 |

---

## 1. Обзор архитектуры

### 1.1 Текущий стек
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js    │────►│   NestJS     │────►│  PostgreSQL │
│  Frontend   │     │   Backend    │     │             │
│  :3000      │     │   :3001      │     │   :5432     │
└─────────────┘     └──────────────┘     └─────────────┘
        │
        └──────────► Keycloak (внешний: new.stankoff.ru/oidc)
```

### 1.2 Целевая архитектура с Camunda 8.8

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Docker Swarm                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐     ┌──────────────┐                                        │
│  │   Next.js   │     │   NestJS     │     ┌────────────────────────────────┐ │
│  │   Frontend  │────►│   Backend    │────►│         Camunda 8.8            │ │
│  │   :3000     │     │   :3001      │     │                                │ │
│  └─────────────┘     └──────────────┘     │  ┌──────────────────────────┐  │ │
│                             │             │  │    orchestration         │  │ │
│                             │             │  │  (Zeebe+Operate+Tasklist)│  │ │
│                             │             │  │    :8088, :26500         │  │ │
│                             │             │  └──────────────────────────┘  │ │
│                             │             │  ┌──────────────────────────┐  │ │
│                             │             │  │    web-modeler-webapp    │  │ │
│                             │             │  │    (BPMN редактор)       │  │ │
│                             │             │  │    :8070                 │  │ │
│                             │             │  └──────────────────────────┘  │ │
│                             │             │  ┌──────────────────────────┐  │ │
│                             │             │  │       optimize           │  │ │
│                             │             │  │    (Heat maps)           │  │ │
│                             │             │  │    :8083                 │  │ │
│                             │             │  └──────────────────────────┘  │ │
│                             │             │  ┌──────────────────────────┐  │ │
│                             │             │  │     elasticsearch        │  │ │
│                             │             │  │    :9200                 │  │ │
│                             │             │  └──────────────────────────┘  │ │
│                             │             └────────────────────────────────┘ │
│                             │                           │                    │
│  ┌──────────────────────────┴───────────────────────────┘                    │
│  │                                                                           │
│  ▼                          ▼                                                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────────┐│
│  │ PostgreSQL  │     │ PostgreSQL  │     │  Keycloak (внешний)             ││
│  │ (App Data)  │     │ (Camunda)   │     │  new.stankoff.ru/oidc           ││
│  │   :5432     │     │   :5433     │     │  realm: stankoff-preprod        ││
│  └─────────────┘     └─────────────┘     └─────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Компоненты Camunda 8.8

| Компонент | Описание | Порт | Обязательный |
|-----------|----------|------|--------------|
| **orchestration** | Zeebe + Operate + Tasklist (3-в-1) | 8088, 26500 | Да |
| **elasticsearch** | Хранение истории | 9200 | Да |
| **web-modeler-webapp** | Визуальный BPMN редактор | 8070 | Рекомендуется |
| **optimize** | Heat maps + аналитика процессов | 8083 | Рекомендуется |
| **connectors** | Готовые интеграции (REST, Email) | 8086 | Опционально |
| **console** | Админ-панель Camunda | 8087 | Опционально |
| **identity** | Управление пользователями | 8084 | Зависит от Keycloak |

### 1.4 Варианты деплоя

#### Вариант A: Lightweight + Web Modeler (рекомендуется для старта)
```bash
# Минимальный набор для разработки
docker-compose -f camunda-8.8/docker-compose.yaml up -d
```
- orchestration + elasticsearch + connectors
- RAM: ~3 GB
- Без Web Modeler (используем bpmn.js во frontend)

#### Вариант B: Full Stack (для preprod/production)
```bash
# Полный набор с Web Modeler и Optimize
docker-compose -f camunda-8.8/docker-compose-full.yaml up -d
```
- Всё включено: Web Modeler, Optimize, Console
- RAM: ~8-10 GB
- Свой Keycloak (нужна интеграция с нашим)

#### Вариант C: Гибридный (оптимальный)
- Используем `docker-compose.yaml` (lightweight)
- Добавляем Web Modeler отдельно
- Интегрируем с нашим Keycloak
- RAM: ~5-6 GB

---

## 2. Инфраструктура

### 2.1 Локальная разработка (используем официальный пакет)

```bash
# 1. Перейти в директорию Camunda
cd camunda-8.8

# 2. Запустить lightweight версию
docker-compose up -d

# 3. Проверить статус
docker-compose ps

# 4. Открыть Operate UI
open http://localhost:8088  # login: demo / demo
```

**Порты для разработки:**
| Сервис | URL | Логин |
|--------|-----|-------|
| Operate + Tasklist | http://localhost:8088 | demo / demo |
| Zeebe gRPC | localhost:26500 | - |
| Elasticsearch | http://localhost:9200 | - |
| Connectors | http://localhost:8086 | - |

### 2.2 Запуск Full версии (с Web Modeler)

```bash
cd camunda-8.8

# Запустить полную версию
docker-compose -f docker-compose-full.yaml up -d

# Дождаться запуска (может занять 2-3 минуты)
docker-compose -f docker-compose-full.yaml ps
```

**Дополнительные порты:**
| Сервис | URL | Логин |
|--------|-----|-------|
| Web Modeler | http://localhost:8070 | через Keycloak |
| Optimize | http://localhost:8083 | через Keycloak |
| Console | http://localhost:8087 | через Keycloak |
| Keycloak (Camunda) | http://localhost:18080/auth | admin / admin |
| Mailpit | http://localhost:8075 | - |

### 2.3 Preprod конфигурация

Создаём отдельный файл `docker-compose.camunda-preprod.yml` для Camunda сервисов:

```yaml
# docker-compose.camunda-preprod.yml
# Camunda 8.8 для preprod.stankoff.ru

services:
  # Orchestration (Zeebe + Operate + Tasklist в одном контейнере)
  camunda-orchestration:
    image: camunda/camunda:8.8.9
    environment:
      - JAVA_TOOL_OPTIONS=-Xms512m -Xmx1g
    ports:
      - "26500:26500"  # gRPC для NestJS
    volumes:
      - camunda-zeebe-data:/usr/local/zeebe/data
      - ./camunda-8.8/.orchestration/application.yaml:/usr/local/camunda/config/application.yaml
    networks:
      - stankoff-preprod-network
    healthcheck:
      test: ["CMD-SHELL", "timeout 10s bash -c ':> /dev/tcp/127.0.0.1/9600' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 1.5G
        reservations:
          memory: 512M
      restart_policy:
        condition: any
    depends_on:
      camunda-elasticsearch:
        condition: service_healthy

  # Elasticsearch для истории процессов
  camunda-elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - cluster.routing.allocation.disk.threshold_enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - camunda-elastic-data:/usr/share/elasticsearch/data
    networks:
      - stankoff-preprod-network
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cat/health | grep -q green"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
      restart_policy:
        condition: any

  # Connectors (опционально)
  camunda-connectors:
    image: camunda/connectors-bundle:8.8.5
    environment:
      - CAMUNDA_CLIENT_GRPCADDRESS=http://camunda-orchestration:26500
      - CAMUNDA_CLIENT_RESTADDRESS=http://camunda-orchestration:8080
    networks:
      - stankoff-preprod-network
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 512M
      restart_policy:
        condition: any
    depends_on:
      camunda-orchestration:
        condition: service_healthy

volumes:
  camunda-zeebe-data:
  camunda-elastic-data:

networks:
  stankoff-preprod-network:
    external: true
```

**Общие требования к серверу (с Camunda):**
- RAM: +3 GB (итого ~6-8 GB)
- Disk: +10 GB для Elasticsearch

### 2.4 Nginx routing

Добавить в `nginx.preprod.conf`:

```nginx
# Camunda Orchestration (Operate + Tasklist UI)
location /camunda/ {
    proxy_pass http://camunda-orchestration:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# Web Modeler (если используется)
location /modeler/ {
    proxy_pass http://web-modeler-webapp:8070/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# Optimize (Heat maps)
location /optimize/ {
    proxy_pass http://optimize:8090/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

**Доступ на preprod:**
- Operate/Tasklist: https://preprod.stankoff.ru/camunda/
- Web Modeler: https://preprod.stankoff.ru/modeler/
- Optimize: https://preprod.stankoff.ru/optimize/

---

## 3. Backend интеграция (NestJS)

### 3.1 Установка зависимостей

```bash
cd apps/backend
npm install @camunda8/sdk zeebe-node
npm install -D @types/node
```

### 3.2 Структура модуля

```
apps/backend/src/modules/bpmn/
├── bpmn.module.ts
├── bpmn.service.ts           # Работа с Zeebe
├── bpmn.controller.ts        # REST API
├── workers/                   # Job workers
│   ├── entity-worker.ts      # Работа с entities
│   ├── notification-worker.ts # Отправка уведомлений
│   └── email-worker.ts       # Отправка email
├── dto/
│   ├── deploy-process.dto.ts
│   ├── start-process.dto.ts
│   └── complete-task.dto.ts
└── interfaces/
    └── process-variables.interface.ts
```

### 3.3 BpmnService

```typescript
// apps/backend/src/modules/bpmn/bpmn.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Camunda8 } from '@camunda8/sdk';
import { ZeebeGrpcClient } from '@camunda8/zeebe';

@Injectable()
export class BpmnService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BpmnService.name);
  private zeebeClient: ZeebeGrpcClient;
  private camunda: Camunda8;

  constructor() {
    this.camunda = new Camunda8({
      zeebeGrpcAddress: process.env.ZEEBE_ADDRESS || 'localhost:26500',
    });
    this.zeebeClient = this.camunda.getZeebeGrpcApiClient();
  }

  async onModuleInit() {
    this.logger.log('Connecting to Zeebe...');
    const topology = await this.zeebeClient.topology();
    this.logger.log(`Connected to Zeebe cluster: ${topology.clusterSize} brokers`);

    // Регистрируем workers
    await this.registerWorkers();
  }

  async onModuleDestroy() {
    await this.zeebeClient.close();
  }

  // ==================== Деплой процессов ====================

  async deployProcess(bpmnXml: string, processId: string): Promise<any> {
    const deployment = await this.zeebeClient.deployResource({
      process: Buffer.from(bpmnXml),
      name: `${processId}.bpmn`,
    });

    this.logger.log(`Deployed process: ${processId}`);
    return deployment;
  }

  // ==================== Запуск процессов ====================

  async startProcess(
    processId: string,
    variables: Record<string, any>,
    businessKey?: string,
  ): Promise<{ processInstanceKey: string }> {
    const result = await this.zeebeClient.createProcessInstance({
      bpmnProcessId: processId,
      variables,
      // businessKey позволяет связать процесс с entity
    });

    this.logger.log(`Started process instance: ${result.processInstanceKey}`);
    return { processInstanceKey: result.processInstanceKey.toString() };
  }

  // ==================== Связь с Entity ====================

  /**
   * Запустить процесс для entity
   */
  async startProcessForEntity(
    processId: string,
    entityId: string,
    workspaceId: string,
    additionalVariables?: Record<string, any>,
  ) {
    return this.startProcess(processId, {
      entityId,
      workspaceId,
      ...additionalVariables,
    }, entityId); // businessKey = entityId
  }

  /**
   * Отправить сообщение в процесс (для продолжения ожидающего события)
   */
  async sendMessage(
    messageName: string,
    correlationKey: string,
    variables?: Record<string, any>,
  ) {
    await this.zeebeClient.publishMessage({
      name: messageName,
      correlationKey,
      variables: variables || {},
      timeToLive: 60000, // 1 минута
    });
  }

  // ==================== Workers ====================

  private async registerWorkers() {
    // Worker для работы с entities
    this.zeebeClient.createWorker({
      taskType: 'update-entity-status',
      taskHandler: async (job) => {
        const { entityId, newStatus } = job.variables;

        // Здесь вызываем EntityService для обновления статуса
        this.logger.log(`Updating entity ${entityId} to status ${newStatus}`);

        // TODO: inject EntityService и вызвать updateStatus

        return job.complete({ statusUpdated: true });
      },
    });

    // Worker для отправки уведомлений
    this.zeebeClient.createWorker({
      taskType: 'send-notification',
      taskHandler: async (job) => {
        const { userId, message, entityId } = job.variables;

        this.logger.log(`Sending notification to ${userId}: ${message}`);

        // TODO: inject NotificationService

        return job.complete({ notificationSent: true });
      },
    });

    // Worker для отправки email
    this.zeebeClient.createWorker({
      taskType: 'send-email',
      taskHandler: async (job) => {
        const { to, subject, body } = job.variables;

        this.logger.log(`Sending email to ${to}`);

        // TODO: inject EmailService

        return job.complete({ emailSent: true });
      },
    });

    this.logger.log('BPMN workers registered');
  }

  // ==================== Получение информации о процессах ====================

  async getProcessInstances(entityId: string): Promise<any[]> {
    // Operate REST API для получения инстансов
    // Требует отдельного HTTP клиента к Operate
    return [];
  }
}
```

### 3.4 BpmnController

```typescript
// apps/backend/src/modules/bpmn/bpmn.controller.ts

import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BpmnService } from './bpmn.service';

@Controller('bpmn')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BpmnController {
  constructor(private readonly bpmnService: BpmnService) {}

  /**
   * Деплой BPMN процесса
   */
  @Post('deploy')
  @Roles('admin')
  async deployProcess(
    @Body() body: { bpmnXml: string; processId: string },
  ) {
    return this.bpmnService.deployProcess(body.bpmnXml, body.processId);
  }

  /**
   * Запустить процесс для entity
   */
  @Post('start/:processId')
  async startProcess(
    @Param('processId') processId: string,
    @Body() body: { entityId: string; workspaceId: string; variables?: Record<string, any> },
  ) {
    return this.bpmnService.startProcessForEntity(
      processId,
      body.entityId,
      body.workspaceId,
      body.variables,
    );
  }

  /**
   * Отправить сообщение в процесс (для событий)
   */
  @Post('message/:messageName')
  async sendMessage(
    @Param('messageName') messageName: string,
    @Body() body: { correlationKey: string; variables?: Record<string, any> },
  ) {
    return this.bpmnService.sendMessage(
      messageName,
      body.correlationKey,
      body.variables,
    );
  }

  /**
   * Получить процессы для entity
   */
  @Get('instances/:entityId')
  async getProcessInstances(@Param('entityId') entityId: string) {
    return this.bpmnService.getProcessInstances(entityId);
  }
}
```

### 3.5 Интеграция с EntityService

```typescript
// Добавить в apps/backend/src/modules/entity/entity.service.ts

// После создания entity - запустить процесс
async create(dto: CreateEntityDto, creatorId: string): Promise<WorkspaceEntity> {
  const entity = await this.entityRepository.save({...});

  // Проверить, есть ли автоматический процесс для workspace
  const processId = await this.getWorkspaceDefaultProcess(entity.workspaceId);
  if (processId) {
    await this.bpmnService.startProcessForEntity(
      processId,
      entity.id,
      entity.workspaceId,
      {
        title: entity.title,
        status: entity.status,
        priority: entity.priority,
        creatorId,
      },
    );
  }

  return entity;
}

// При изменении статуса - отправить сообщение в процесс
async updateStatus(entityId: string, newStatus: string): Promise<WorkspaceEntity> {
  const entity = await this.findOne(entityId);
  const oldStatus = entity.status;

  entity.status = newStatus;
  await this.entityRepository.save(entity);

  // Отправить сообщение в процесс
  await this.bpmnService.sendMessage(
    'status-changed',
    entityId, // correlationKey
    { oldStatus, newStatus },
  );

  return entity;
}
```

---

## 4. Frontend интеграция (Next.js)

### 4.1 Установка зависимостей

```bash
cd apps/frontend
npm install bpmn-js bpmn-js-properties-panel @bpmn-io/properties-panel
npm install camunda-bpmn-moddle  # Для Camunda-специфичных расширений
npm install -D @types/bpmn-js
```

### 4.2 Структура компонентов

```
apps/frontend/src/components/bpmn/
├── BpmnEditor.tsx          # Редактор BPMN диаграмм
├── BpmnViewer.tsx          # Просмотр диаграммы (read-only)
├── BpmnHeatmap.tsx         # Тепловая карта
├── ProcessList.tsx         # Список процессов workspace
├── ProcessInstanceList.tsx # Запущенные инстансы
└── hooks/
    ├── useBpmnModeler.ts
    └── useBpmnViewer.ts
```

### 4.3 BpmnEditor компонент

```tsx
// apps/frontend/src/components/bpmn/BpmnEditor.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
  CamundaPlatformPropertiesProviderModule,
} from 'bpmn-js-properties-panel';
import CamundaBpmnModdle from 'camunda-bpmn-moddle/resources/camunda.json';

// Стили bpmn-js
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';

interface BpmnEditorProps {
  initialXml?: string;
  onSave?: (xml: string) => void;
  onDeploy?: (xml: string) => void;
  readOnly?: boolean;
}

// Пустая диаграмма по умолчанию
const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export function BpmnEditor({
  initialXml,
  onSave,
  onDeploy,
  readOnly = false,
}: BpmnEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propertiesRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Инициализация модельера
  useEffect(() => {
    if (!containerRef.current || !propertiesRef.current) return;

    const modeler = new BpmnModeler({
      container: containerRef.current,
      propertiesPanel: {
        parent: propertiesRef.current,
      },
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        CamundaPlatformPropertiesProviderModule,
      ],
      moddleExtensions: {
        camunda: CamundaBpmnModdle,
      },
    });

    modelerRef.current = modeler;

    // Загрузить диаграмму
    const xml = initialXml || EMPTY_DIAGRAM;
    modeler.importXML(xml)
      .then(() => {
        setIsLoading(false);
        // Центрировать и масштабировать
        const canvas = modeler.get('canvas') as any;
        canvas.zoom('fit-viewport');
      })
      .catch((err: Error) => {
        setError(err.message);
        setIsLoading(false);
      });

    return () => {
      modeler.destroy();
    };
  }, [initialXml]);

  // Сохранение XML
  const handleSave = useCallback(async () => {
    if (!modelerRef.current) return;

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      onSave?.(xml!);
    } catch (err) {
      console.error('Failed to save BPMN:', err);
    }
  }, [onSave]);

  // Деплой
  const handleDeploy = useCallback(async () => {
    if (!modelerRef.current) return;

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      onDeploy?.(xml!);
    } catch (err) {
      console.error('Failed to deploy BPMN:', err);
    }
  }, [onDeploy]);

  // Экспорт SVG
  const handleExportSvg = useCallback(async () => {
    if (!modelerRef.current) return;

    try {
      const { svg } = await modelerRef.current.saveSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'process.svg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export SVG:', err);
    }
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-red-50 text-red-600">
        Ошибка загрузки диаграммы: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-gray-50">
        <button
          onClick={handleSave}
          className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Сохранить
        </button>
        <button
          onClick={handleDeploy}
          className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Развернуть
        </button>
        <button
          onClick={handleExportSvg}
          className="px-3 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Экспорт SVG
        </button>
      </div>

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative"
          style={{ minHeight: '400px' }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              Загрузка...
            </div>
          )}
        </div>

        {/* Properties Panel */}
        <div
          ref={propertiesRef}
          className="w-80 border-l overflow-y-auto bg-white"
        />
      </div>
    </div>
  );
}
```

### 4.4 BpmnHeatmap компонент

```tsx
// apps/frontend/src/components/bpmn/BpmnHeatmap.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import BpmnViewer from 'bpmn-js/lib/Viewer';

interface HeatmapData {
  elementId: string;
  count: number;
  avgDuration?: number; // секунды
}

interface BpmnHeatmapProps {
  xml: string;
  data: HeatmapData[];
}

// Цвета для тепловой карты
function getHeatColor(ratio: number): string {
  // От зелёного (0) через жёлтый (0.5) к красному (1)
  const r = Math.round(255 * Math.min(1, ratio * 2));
  const g = Math.round(255 * Math.min(1, (1 - ratio) * 2));
  return `rgb(${r}, ${g}, 0)`;
}

export function BpmnHeatmap({ xml, data }: BpmnHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BpmnViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new BpmnViewer({
      container: containerRef.current,
    });

    viewerRef.current = viewer;

    viewer.importXML(xml).then(() => {
      const canvas = viewer.get('canvas') as any;
      const overlays = viewer.get('overlays') as any;

      canvas.zoom('fit-viewport');

      // Найти максимальное значение для нормализации
      const maxCount = Math.max(...data.map(d => d.count), 1);

      // Добавить оверлеи для каждого элемента
      data.forEach(({ elementId, count, avgDuration }) => {
        const ratio = count / maxCount;
        const color = getHeatColor(ratio);

        // Цветной оверлей
        overlays.add(elementId, 'heatmap', {
          position: { top: -5, left: -5 },
          html: `
            <div style="
              position: absolute;
              width: calc(100% + 10px);
              height: calc(100% + 10px);
              background: ${color};
              opacity: 0.3;
              border-radius: 5px;
              pointer-events: none;
            "></div>
          `,
        });

        // Счётчик
        overlays.add(elementId, 'counter', {
          position: { bottom: 0, right: 0 },
          html: `
            <div style="
              background: #333;
              color: white;
              padding: 2px 6px;
              border-radius: 10px;
              font-size: 11px;
              font-weight: bold;
            ">
              ${count}
              ${avgDuration ? `<br/>${Math.round(avgDuration / 60)}м` : ''}
            </div>
          `,
        });
      });
    });

    return () => {
      viewer.destroy();
    };
  }, [xml, data]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full" />

      {/* Легенда */}
      <div className="absolute bottom-4 right-4 bg-white p-3 rounded shadow border">
        <div className="text-sm font-medium mb-2">Частота выполнения</div>
        <div className="flex items-center gap-2">
          <div className="w-20 h-4 rounded" style={{
            background: 'linear-gradient(to right, rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))'
          }} />
          <span className="text-xs">Низкая → Высокая</span>
        </div>
      </div>
    </div>
  );
}
```

### 4.5 Страница управления процессами

```tsx
// apps/frontend/src/app/workspaces/[id]/processes/page.tsx
'use client';

import { useState } from 'react';
import { BpmnEditor } from '@/components/bpmn/BpmnEditor';
import { BpmnHeatmap } from '@/components/bpmn/BpmnHeatmap';
import { apiClient } from '@/lib/api/client';

export default function ProcessesPage({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState<'editor' | 'instances' | 'heatmap'>('editor');
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);

  const handleDeploy = async (xml: string) => {
    try {
      await apiClient.post('/bpmn/deploy', {
        bpmnXml: xml,
        processId: `workspace-${params.id}-process`,
      });
      alert('Процесс развёрнут!');
    } catch (error) {
      console.error('Deploy failed:', error);
      alert('Ошибка развёртывания');
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 ${activeTab === 'editor' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Редактор
        </button>
        <button
          onClick={() => setActiveTab('instances')}
          className={`px-4 py-2 ${activeTab === 'instances' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Запущенные процессы
        </button>
        <button
          onClick={() => setActiveTab('heatmap')}
          className={`px-4 py-2 ${activeTab === 'heatmap' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Тепловая карта
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' && (
          <BpmnEditor onDeploy={handleDeploy} />
        )}

        {activeTab === 'instances' && (
          <div className="p-4">
            {/* Список запущенных инстансов из Operate */}
            <p>Список процессов будет загружен из Camunda Operate</p>
          </div>
        )}

        {activeTab === 'heatmap' && (
          <BpmnHeatmap
            xml="" // Загрузить из API
            data={[]} // Загрузить статистику
          />
        )}
      </div>
    </div>
  );
}
```

---

## 5. Модель данных

### 5.1 Новые таблицы

```sql
-- Связь процессов с workspace
CREATE TABLE workspace_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  "processId" VARCHAR(255) NOT NULL,  -- ID в Camunda
  name VARCHAR(255) NOT NULL,
  description TEXT,
  "bpmnXml" TEXT NOT NULL,
  version INT DEFAULT 1,
  "isActive" BOOLEAN DEFAULT true,
  "isDefault" BOOLEAN DEFAULT false,  -- Запускать автоматически для новых entities
  "createdById" UUID REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Связь инстансов процессов с entities
CREATE TABLE process_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityId" UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  "processId" VARCHAR(255) NOT NULL,
  "processInstanceKey" VARCHAR(255) NOT NULL,  -- Ключ в Zeebe
  status VARCHAR(50) DEFAULT 'active',  -- active, completed, terminated
  variables JSONB DEFAULT '{}',
  "startedAt" TIMESTAMPTZ DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "createdById" UUID REFERENCES users(id)
);

-- Индексы
CREATE INDEX idx_workspace_processes_workspace ON workspace_processes("workspaceId");
CREATE INDEX idx_process_instances_entity ON process_instances("entityId");
CREATE INDEX idx_process_instances_key ON process_instances("processInstanceKey");
```

### 5.2 Миграция

```typescript
// apps/backend/src/migrations/XXXXXXXXXX-AddBpmnTables.ts

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBpmnTables implements MigrationInterface {
  name = 'AddBpmnTables';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workspace_processes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        "processId" VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        "bpmnXml" TEXT NOT NULL,
        version INT DEFAULT 1,
        "isActive" BOOLEAN DEFAULT true,
        "isDefault" BOOLEAN DEFAULT false,
        "createdById" UUID REFERENCES users(id),
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE process_instances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "entityId" UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        "processId" VARCHAR(255) NOT NULL,
        "processInstanceKey" VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        variables JSONB DEFAULT '{}',
        "startedAt" TIMESTAMPTZ DEFAULT NOW(),
        "completedAt" TIMESTAMPTZ,
        "createdById" UUID REFERENCES users(id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_workspace_processes_workspace ON workspace_processes("workspaceId")
    `);

    await queryRunner.query(`
      CREATE INDEX idx_process_instances_entity ON process_instances("entityId")
    `);

    await queryRunner.query(`
      CREATE INDEX idx_process_instances_key ON process_instances("processInstanceKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS process_instances`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_processes`);
  }
}
```

---

## 6. Пример BPMN процесса

### 6.1 Процесс обработки заявки

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                  targetNamespace="http://stankoff.ru/bpmn">

  <bpmn:process id="entity-processing" name="Обработка заявки" isExecutable="true">

    <!-- Старт -->
    <bpmn:startEvent id="start" name="Заявка создана">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>

    <!-- Проверка приоритета -->
    <bpmn:exclusiveGateway id="gateway1" name="Приоритет?">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flowHigh</bpmn:outgoing>
      <bpmn:outgoing>flowNormal</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <!-- Высокий приоритет - срочное назначение -->
    <bpmn:serviceTask id="urgentAssign" name="Срочное назначение">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="update-entity-status" />
        <zeebe:ioMapping>
          <zeebe:input source="= entityId" target="entityId" />
          <zeebe:input source="= 'in_progress'" target="newStatus" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
      <bpmn:incoming>flowHigh</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Обычный приоритет -->
    <bpmn:serviceTask id="normalAssign" name="Обычное назначение">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="update-entity-status" />
      </bpmn:extensionElements>
      <bpmn:incoming>flowNormal</bpmn:incoming>
      <bpmn:outgoing>flow3</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Ожидание изменения статуса -->
    <bpmn:intermediateCatchEvent id="waitStatus" name="Ожидание решения">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:incoming>flow3</bpmn:incoming>
      <bpmn:outgoing>flow4</bpmn:outgoing>
      <bpmn:messageEventDefinition id="msg1" messageRef="statusChangedMsg" />
    </bpmn:intermediateCatchEvent>

    <!-- Уведомление о завершении -->
    <bpmn:serviceTask id="notify" name="Уведомить создателя">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="send-notification" />
      </bpmn:extensionElements>
      <bpmn:incoming>flow4</bpmn:incoming>
      <bpmn:outgoing>flow5</bpmn:outgoing>
    </bpmn:serviceTask>

    <!-- Конец -->
    <bpmn:endEvent id="end" name="Процесс завершён">
      <bpmn:incoming>flow5</bpmn:incoming>
    </bpmn:endEvent>

    <!-- Потоки -->
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="gateway1" />
    <bpmn:sequenceFlow id="flowHigh" sourceRef="gateway1" targetRef="urgentAssign">
      <bpmn:conditionExpression>= priority = "high"</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="flowNormal" sourceRef="gateway1" targetRef="normalAssign">
      <bpmn:conditionExpression>= priority != "high"</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="flow2" sourceRef="urgentAssign" targetRef="waitStatus" />
    <bpmn:sequenceFlow id="flow3" sourceRef="normalAssign" targetRef="waitStatus" />
    <bpmn:sequenceFlow id="flow4" sourceRef="waitStatus" targetRef="notify" />
    <bpmn:sequenceFlow id="flow5" sourceRef="notify" targetRef="end" />

  </bpmn:process>

  <bpmn:message id="statusChangedMsg" name="status-changed" />

</bpmn:definitions>
```

---

## 7. Heat Maps (Тепловые карты)

### 7.1 Сбор данных

Camunda Operate автоматически собирает:
- Количество выполнений каждого элемента
- Среднее время выполнения
- Количество инцидентов

### 7.2 API для heat map данных

```typescript
// apps/backend/src/modules/bpmn/bpmn.service.ts

async getHeatmapData(processId: string, dateFrom?: Date, dateTo?: Date): Promise<HeatmapData[]> {
  // Запрос к Operate REST API
  const response = await fetch(
    `${process.env.OPERATE_URL}/api/process-instances/statistics?processId=${processId}`,
    {
      headers: { Authorization: `Bearer ${await this.getOperateToken()}` },
    }
  );

  const data = await response.json();

  return data.flowNodeStatistics.map((node: any) => ({
    elementId: node.activityId,
    count: node.active + node.completed + node.incidents,
    avgDuration: node.duration?.avg,
  }));
}
```

### 7.3 Интеграция с Operate

```typescript
// Получение статистики напрямую из Elasticsearch
async getElementStatistics(processDefinitionKey: string): Promise<any[]> {
  const response = await this.elasticsearchClient.search({
    index: 'operate-flownode-instance*',
    body: {
      size: 0,
      query: {
        term: { processDefinitionKey },
      },
      aggs: {
        by_element: {
          terms: { field: 'flowNodeId', size: 1000 },
          aggs: {
            avg_duration: { avg: { field: 'duration' } },
            states: { terms: { field: 'state' } },
          },
        },
      },
    },
  });

  return response.aggregations.by_element.buckets.map((bucket: any) => ({
    elementId: bucket.key,
    count: bucket.doc_count,
    avgDuration: bucket.avg_duration.value / 1000, // в секундах
  }));
}
```

---

## 8. План внедрения (обновлённый)

### Фаза 1: Локальный запуск и знакомство ✅ DONE

| # | Задача | Статус |
|---|--------|--------|
| 1.1 | Запустить `docker-compose.yaml` локально | ✅ |
| 1.2 | Изучить Operate UI (http://localhost:8088) | ✅ |
| 1.3 | Запустить full версию с Web Modeler | ✅ |
| 1.4 | Создать тестовый BPMN процесс в Web Modeler | ✅ |
| 1.5 | Задеплоить и запустить процесс | ✅ |

### Фаза 2: Backend интеграция ✅ DONE

| # | Задача | Статус |
|---|--------|--------|
| 2.1 | Установить `@camunda8/sdk` в NestJS | ✅ |
| 2.2 | Создать BpmnModule (service, controller) | ✅ |
| 2.3 | Подключиться к Zeebe (localhost:26500) | ✅ |
| 2.4 | Реализовать workers для entities | ✅ 7 workers |
| 2.5 | Интегрировать запуск процесса при создании entity | ✅ через триггеры |
| 2.6 | Создать миграции для BPMN таблиц | ✅ |
| 2.7 | Тестирование локально | ✅ |

**Реализовано сверх плана:**
- Шаблоны BPMN процессов (`bpmn-templates.service.ts`)
- Система триггеров (on_create, on_status_change, on_assign, webhook, scheduled)
- User Tasks (inbox, claim/unclaim, complete, delegate)
- Entity Links (связи между сущностями, spawn)
- Статистика процессов

### Фаза 3: Frontend интеграция ✅ DONE

| # | Задача | Статус |
|---|--------|--------|
| 3.1 | Установить `bpmn-js` | ✅ |
| 3.2 | Создать BpmnViewer компонент | ✅ |
| 3.3 | Добавить вкладку "Процессы" в entity detail | ✅ |
| 3.4 | Показывать активные процессы для entity | ✅ |
| 3.5 | BpmnEditor для создания процессов | ✅ |

**Реализовано сверх плана:**
- BPMN редактор с properties panel
- Управление триггерами (UI)
- Inbox для user tasks
- Страница настроек процессов в workspace

### Фаза 4: Деплой на preprod ✅ DONE

| # | Задача | Статус |
|---|--------|--------|
| 4.1 | Проверить ресурсы сервера (RAM, Disk) | ✅ 4 CPU, 8 GB RAM |
| 4.2 | Создать `docker-compose.camunda.yml` | ✅ |
| 4.3 | Добавить в nginx routing | ✅ |
| 4.4 | Задеплоить Zeebe на preprod | ✅ |
| 4.5 | Настроить переменные окружения | ✅ |
| 4.6 | Проверить интеграцию backend ↔ Zeebe | ✅ |

**Примечание:** Используется lightweight конфигурация (только Zeebe, без Operate/Tasklist UI). Graceful degradation — если Zeebe недоступен, портал работает без BPMN.

### Фаза 5: Heat Maps (Per-Element аналитика) ✅

| # | Задача | Статус |
|---|--------|--------|
| 5.1 | Создать ProcessActivityLog entity + миграция | ✅ |
| 5.2 | Добавить логирование в workers (7 handlers) | ✅ |
| 5.3 | Реализовать getElementStats в ProcessMiningService | ✅ |
| 5.4 | Создать endpoint GET /api/bpmn/mining/definitions/:id/element-stats | ✅ |
| 5.5 | Обновить BpmnHeatMap (per-element overlays, цветовая шкала) | ✅ |
| 5.6 | Обновить ProcessDetailView (загрузка element stats, боковая панель) | ✅ |

> **Решение:** Вместо Camunda Optimize (требует ~3-4 GB RAM) реализована собственная per-element аналитика через ProcessActivityLog + агрегация данных из user_tasks. Экономия ресурсов сервера при полноценной визуализации.

### Фаза 6: Документация ✅

| # | Задача | Статус |
|---|--------|--------|
| 6.1 | Обновить ARCHITECTURE.md | ✅ |
| 6.2 | Написать инструкцию по созданию процессов | ✅ docs/BPMN_USER_GUIDE.md |
| 6.3 | Добавить примеры BPMN процессов | ✅ шаблоны в коде |

**Общая оценка: 3-4 недели**

---

## 9. Требования к ресурсам

### 9.1 Lightweight (docker-compose.yaml)

| Компонент | RAM | Disk |
|-----------|-----|------|
| orchestration (Zeebe+Operate+Tasklist) | 1-1.5 GB | 2 GB |
| elasticsearch | 512 MB - 1 GB | 5 GB |
| connectors | 256-512 MB | - |
| **Итого Camunda** | **2-3 GB** | **7 GB** |

### 9.2 Full Stack (docker-compose-full.yaml)

| Компонент | RAM | Disk |
|-----------|-----|------|
| orchestration | 1.5 GB | 2 GB |
| elasticsearch | 1 GB | 10 GB |
| web-modeler (3 сервиса) | 1.5 GB | 1 GB |
| optimize | 1 GB | - |
| identity | 512 MB | - |
| keycloak | 512 MB | - |
| postgres (для Camunda) | 256 MB | 1 GB |
| console | 512 MB | - |
| **Итого Camunda** | **7-8 GB** | **14 GB** |

### 9.3 Текущий сервер preprod

```bash
# Проверить ресурсы:
ssh youredik@51.250.117.178 "free -h && df -h"
```

**Текущее потребление (без Camunda):**
- PostgreSQL: ~256 MB
- Backend: ~200 MB
- Frontend: ~150 MB
- Nginx: ~50 MB
- **Итого: ~700 MB**

**Требуется для Camunda (lightweight):**
- RAM: +3 GB (итого нужно ~4 GB свободных)
- Disk: +10 GB

### 9.4 Рекомендация по серверу

Для preprod с Camunda рекомендуется:
- **RAM:** минимум 6 GB, рекомендуется 8 GB
- **Disk:** минимум 30 GB SSD
- **CPU:** 2-4 vCPU

---

## 10. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Нехватка RAM на сервере | Высокая | Высокое | Оптимизировать JVM, использовать Camunda Cloud |
| Сложность интеграции Zeebe | Средняя | Среднее | Начать с простых процессов |
| Производительность Elasticsearch | Средняя | Среднее | Настроить retention policy |
| Кривая обучения BPMN | Средняя | Низкое | Создать шаблоны процессов |

---

## 11. Альтернативы

Если ресурсов сервера недостаточно:

### 11.1 Camunda Cloud (SaaS)
- Нет необходимости в инфраструктуре
- Pay-as-you-go
- Free tier: 150 процессов/месяц

### 11.2 Упрощённая собственная реализация
- Использовать только bpmn-js для редактора
- Хранить BPMN XML в PostgreSQL
- Простой state machine вместо полного Zeebe

---

## 12. Текущее состояние и следующие шаги

### Реализовано ✅
1. [x] Изучить официальный пакет Camunda 8.8
2. [x] Запустить локально (Zeebe gRPC на 26500)
3. [x] Backend интеграция (BpmnModule, Workers, Triggers, User Tasks, Entity Links)
4. [x] Frontend интеграция (BpmnEditor, BpmnViewer, Inbox, настройки процессов)
5. [x] Деплой на preprod (lightweight — только Zeebe)
6. [x] 7 workers: update-entity-status, send-notification, send-email, log-activity, set-assignee, process-completed, classify-entity
7. [x] Шаблоны BPMN процессов (hardcoded в bpmn-templates.service.ts)

8. [x] Шаблоны для Сервиса: service-support-v2, claims-management, sla-escalation
9. [x] Per-element heat map (собственная реализация вместо Optimize)
10. [x] Инструкция для менеджеров (docs/BPMN_USER_GUIDE.md)

### Решённые вопросы:
- **Keycloak:** Используется наш (`new.stankoff.ru`), realm `stankoff-preprod`
- **Web Modeler:** Не используется, bpmn-js встроен во frontend
- **Optimize (Heat Maps):** Заменён собственной реализацией (ProcessActivityLog + агрегация), экономия ~3-4 GB RAM

### Архитектура Heat Map:
- `ProcessActivityLog` entity — логирование выполнения каждого элемента из workers
- `getElementStats()` в ProcessMiningService — агрегация из activity_logs + user_tasks
- `BpmnHeatMap` — per-element overlays через bpmn-js (цветовая шкала + бейджи)

### Следующие шаги (при необходимости):
- [ ] Добавить Timer Events для автоэскалации
- [ ] Интеграция с DMN для автоматических решений в процессах
- [ ] Process Instance Migration при обновлении процесса

---

## 13. Быстрый старт

```bash
# 1. Запустить Camunda локально
cd camunda-8.8
docker-compose up -d

# 2. Проверить статус
docker-compose ps

# 3. Открыть Operate
open http://localhost:8088
# Логин: demo / Пароль: demo

# 4. Остановить
docker-compose down
```

---

**Документ создан:** Claude Code
**Версия:** 3.0 (обновлён — фазы 1-4 реализованы)
**Последнее обновление:** 2026-02-08
**Артефакты:** `camunda-8.8/` в корне проекта
