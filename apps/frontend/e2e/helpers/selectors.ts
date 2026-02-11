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
  detailsSection: '[data-testid="filter-section-details"]',
  field: (id: string) => `[data-testid="filter-field-${id}"]`,
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
// AI Classification
// ============================================================================
export const ai = {
  classificationPanel: '[data-testid="ai-classification-panel"]',
  classifyButton: '[data-testid="ai-classify-button"]',
};

// ============================================================================
// AI Assistant
// ============================================================================
export const aiAssistant = {
  tab: '[data-testid="ai-assistant-tab"]',
  generateBtn: '[data-testid="ai-generate-response-btn"]',
  streamingDraft: '[data-testid="ai-streaming-draft"]',
  generatedDraft: '[data-testid="ai-generated-draft"]',
  draftText: '[data-testid="ai-draft-text"]',
  copyBtn: '[data-testid="ai-copy-draft-btn"]',
  insertBtn: '[data-testid="ai-insert-draft-btn"]',
  draftSources: '[data-testid="ai-draft-sources"]',
  actionsSection: '[data-testid="ai-actions-section"]',
  actionItem: '[data-testid="ai-action-item"]',
  similarCasesSection: '[data-testid="ai-similar-cases-section"]',
  similarCase: '[data-testid="ai-similar-case"]',
  expertsSection: '[data-testid="ai-experts-section"]',
  expertCard: '[data-testid="ai-expert-card"]',
  relatedContext: '[data-testid="ai-related-context"]',
  keywordsSection: '[data-testid="ai-keywords-section"]',
  keywordTag: '[data-testid="ai-keyword-tag"]',
  loading: '[data-testid="ai-assistant-loading"]',
  unavailable: '[data-testid="ai-assistant-unavailable"]',
  noData: '[data-testid="ai-assistant-no-data"]',
};

// ============================================================================
// AI Summary Banner
// ============================================================================
export const aiSummary = {
  banner: '[data-testid="ai-summary-banner"]',
  toggle: '[data-testid="ai-summary-toggle"]',
  text: '[data-testid="ai-summary-text"]',
  loading: '[data-testid="ai-summary-loading"]',
};

// ============================================================================
// Chat
// ============================================================================
export const chat = {
  // Page
  page: '[data-testid="chat-page"]',
  emptyState: '[data-testid="chat-empty-state"]',

  // Conversation list
  conversationList: '[data-testid="chat-conversation-list"]',
  convSearch: '[data-testid="chat-conv-search"]',
  newBtn: '[data-testid="chat-new-btn"]',

  // Chat view
  view: '[data-testid="chat-view"]',
  pinnedBanner: '[data-testid="chat-pinned-banner"]',

  // Header
  header: '[data-testid="chat-header"]',
  headerName: '[data-testid="chat-header-name"]',
  headerStatus: '[data-testid="chat-header-status"]',
  searchBtn: '[data-testid="chat-search-btn"]',
  menuBtn: '[data-testid="chat-menu-btn"]',

  // Input
  input: '[data-testid="chat-input"]',
  textarea: '[data-testid="chat-input-textarea"]',
  sendBtn: '[data-testid="chat-send-btn"]',
  attachBtn: '[data-testid="chat-attach-btn"]',
  fileInput: '[data-testid="chat-file-input"]',
  micBtn: '[data-testid="chat-mic-btn"]',
  replyPreview: '[data-testid="chat-reply-preview"]',
  cancelReplyBtn: '[data-testid="chat-cancel-reply-btn"]',
  pendingFiles: '[data-testid="chat-pending-files"]',
  dropZone: '[data-testid="chat-drop-zone"]',
  recording: '[data-testid="chat-recording"]',
  recordingCancel: '[data-testid="chat-recording-cancel"]',
  recordingSend: '[data-testid="chat-recording-send"]',

  // Message bubble
  messageBubble: '[data-testid="chat-message-bubble"]',
  messageContent: '[data-testid="chat-message-content"]',
  messagePinIcon: '[data-testid="chat-message-pin-icon"]',
  messageEdited: '[data-testid="chat-message-edited"]',
  systemMessage: '[data-testid="chat-system-message"]',
  editInput: '[data-testid="chat-edit-input"]',

  // Reactions
  reactionBar: '[data-testid="chat-reaction-bar"]',
  reaction: '[data-testid="chat-reaction"]',
  hoverReply: '[data-testid="chat-hover-reply"]',
  hoverReaction: '[data-testid="chat-hover-reaction"]',
  quickReactions: '[data-testid="chat-quick-reactions"]',

  // Context menu
  contextMenu: '[data-testid="chat-context-menu"]',
  ctxReply: '[data-testid="chat-ctx-reply"]',
  ctxCopy: '[data-testid="chat-ctx-copy"]',
  ctxPin: '[data-testid="chat-ctx-pin"]',
  ctxEdit: '[data-testid="chat-ctx-edit"]',
  ctxDelete: '[data-testid="chat-ctx-delete"]',

  // Search panel
  searchPanel: '[data-testid="chat-search-panel"]',
  searchInput: '[data-testid="chat-search-input"]',
  searchCount: '[data-testid="chat-search-count"]',
  searchResults: '[data-testid="chat-search-results"]',
  searchResult: '[data-testid="chat-search-result"]',
  searchUp: '[data-testid="chat-search-up"]',
  searchDown: '[data-testid="chat-search-down"]',
  searchClose: '[data-testid="chat-search-close"]',
  searchEmpty: '[data-testid="chat-search-empty"]',

  // Menu panel
  menuPanel: '[data-testid="chat-menu-panel"]',
  menuParticipants: '[data-testid="chat-menu-participants"]',
  menuParticipantCount: '[data-testid="chat-menu-participant-count"]',
  menuAddBtn: '[data-testid="chat-menu-add-btn"]',
  menuParticipant: '[data-testid="chat-menu-participant"]',
  menuRemoveBtn: '[data-testid="chat-menu-remove-btn"]',
  menuLeaveBtn: '[data-testid="chat-menu-leave-btn"]',
  menuMemberSearch: '[data-testid="chat-menu-member-search"]',
  menuAddUser: '[data-testid="chat-menu-add-user"]',
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
