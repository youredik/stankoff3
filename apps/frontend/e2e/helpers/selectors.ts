/**
 * Централизованные селекторы для E2E тестов.
 * Все data-testid и повторяющиеся селекторы — в одном месте.
 */

// ============================================================================
// Sidebar
// ============================================================================
export const sidebar = {
  root: '[data-testid="sidebar"]',
  workspaceItem: '[data-testid="sidebar-workspace-item"]',
  workspaceButton: '[data-testid="sidebar-workspace-button"]',
  workspaceMenu: '[data-testid="sidebar-workspace-menu"]',
  createWorkspace: '[data-testid="sidebar-create-workspace"]',
  section: '[data-testid="sidebar-section"]',
  sectionToggle: '[data-testid="sidebar-section-toggle"]',
  inboxButton: '[data-testid="sidebar-inbox-button"]',
  inboxCount: '[data-testid="sidebar-inbox-count"]',
  adminLink: '[data-testid="sidebar-admin-link"]',
  logout: '[data-testid="sidebar-logout"]',
};

// ============================================================================
// Header
// ============================================================================
export const header = {
  root: '[data-testid="header"]',
  viewToggleKanban: '[data-testid="view-toggle-kanban"]',
  viewToggleTable: '[data-testid="view-toggle-table"]',
  viewToggleAnalytics: '[data-testid="view-toggle-analytics"]',
  notificationBell: '[data-testid="notification-bell"]',
  userMenuButton: '[data-testid="user-menu-button"]',
};

// ============================================================================
// Kanban Board
// ============================================================================
export const kanban = {
  board: '[data-testid="kanban-board"]',
  column: '[data-testid="kanban-column"]',
  card: '[data-testid="kanban-card"]',
  newEntityButton: '[data-testid="kanban-new-entity-button"]',
  filterButton: '[data-testid="kanban-filter-button"]',
  viewModeBadge: '[data-testid="kanban-view-mode-badge"]',
};

// ============================================================================
// Entity Detail Panel
// ============================================================================
export const entityDetail = {
  overlay: '[data-testid="detail-panel-overlay"]',
  panel: '[data-testid="entity-detail-panel"]',
  title: '[data-testid="entity-title"]',
  customId: '[data-testid="entity-custom-id"]',
  statusSection: '[data-testid="entity-status-section"]',
  assigneeSection: '[data-testid="entity-assignee-section"]',
  prioritySection: '[data-testid="entity-priority-section"]',
  commentsSection: '[data-testid="entity-comments-section"]',
  closeButton: '[data-testid="entity-close-button"]',
};

// ============================================================================
// Create Entity Modal
// ============================================================================
export const createEntity = {
  modal: '[data-testid="create-entity-modal"]',
  titleInput: '[data-testid="create-entity-title-input"]',
  submit: '[data-testid="create-entity-submit"]',
};

// ============================================================================
// Filter Panel
// ============================================================================
export const filterPanel = {
  root: '[data-testid="filter-panel"]',
  searchInput: '[data-testid="filter-search-input"]',
  resetButton: '[data-testid="filter-reset-button"]',
};

// ============================================================================
// Notification Panel
// ============================================================================
export const notifications = {
  panel: '[data-testid="notification-panel"]',
  markAllRead: '[data-testid="notification-mark-all-read"]',
  item: '[data-testid="notification-item"]',
};

// ============================================================================
// Global Search
// ============================================================================
export const globalSearch = {
  trigger: '[data-testid="global-search-trigger"]',
  input: '[data-testid="global-search-input"]',
  results: '[data-testid="global-search-results"]',
};

// ============================================================================
// BPMN
// ============================================================================
export const bpmn = {
  processList: '[data-testid="process-list"]',
  processCreateButton: '[data-testid="process-create-button"]',
  bpmnEditor: '[data-testid="bpmn-editor"]',
  processDeployButton: '[data-testid="process-deploy-button"]',
  taskInbox: '[data-testid="task-inbox"]',
  taskCard: '[data-testid="task-card"]',
  taskDetail: '[data-testid="task-detail"]',
  taskClaimButton: '[data-testid="task-claim-button"]',
  taskCompleteButton: '[data-testid="task-complete-button"]',
  triggersList: '[data-testid="triggers-list"]',
  triggerRow: '[data-testid="trigger-row"]',
  incidentPanel: '[data-testid="incident-panel"]',
  incidentRetryButton: '[data-testid="incident-retry-button"]',
  startProcessModal: '[data-testid="start-process-modal"]',
  dynamicForm: '[data-testid="dynamic-form"]',
  linkedEntities: '[data-testid="linked-entities"]',
  addLinkButton: '[data-testid="add-link-button"]',
};

// ============================================================================
// Workspace Builder
// ============================================================================
export const workspaceBuilder = {
  root: '[data-testid="workspace-builder"]',
  saveButton: '[data-testid="ws-save-button"]',
  fieldPalette: '[data-testid="field-palette"]',
  fieldCard: '[data-testid="field-card"]',
  fieldEditor: '[data-testid="field-editor"]',
  sectionCard: '[data-testid="section-card"]',
};

// ============================================================================
// SLA
// ============================================================================
export const sla = {
  settings: '[data-testid="sla-settings"]',
  definitionRow: '[data-testid="sla-definition-row"]',
  statusBadge: '[data-testid="sla-status-badge"]',
  timer: '[data-testid="sla-timer"]',
};

// ============================================================================
// DMN
// ============================================================================
export const dmn = {
  settings: '[data-testid="dmn-settings"]',
  editor: '[data-testid="dmn-editor"]',
  ruleRow: '[data-testid="dmn-rule-row"]',
};

// ============================================================================
// AI
// ============================================================================
export const ai = {
  classificationPanel: '[data-testid="ai-classification-panel"]',
  classifyButton: '[data-testid="ai-classify-button"]',
};

// ============================================================================
// Admin
// ============================================================================
export const admin = {
  userList: '[data-testid="user-list"]',
  userRow: '[data-testid="user-row"]',
};

// ============================================================================
// Table View
// ============================================================================
export const tableView = {
  root: '[data-testid="table-view"]',
  row: '[data-testid="table-row"]',
  sortHeader: '[data-testid="table-sort-header"]',
  pagination: '[data-testid="table-pagination"]',
};
