import { mergeTimeline } from './mergeTimeline';
import type { Comment, AuditLog } from '@/types';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    entityId: 'e1',
    author: { id: 'u1', firstName: 'Иван', lastName: 'Петров', email: 'i@test.ru' } as any,
    content: '<p>Текст</p>',
    createdAt: new Date('2025-01-10T10:00:00Z') as any,
    updatedAt: new Date('2025-01-10T10:00:00Z') as any,
    ...overrides,
  };
}

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'a1',
    action: 'entity:created' as any,
    actor: { id: 'u1', firstName: 'Иван', lastName: 'Петров', email: 'i@test.ru' } as any,
    actorId: 'u1',
    entityId: 'e1',
    workspaceId: 'w1',
    details: { description: 'Создана заявка' },
    createdAt: '2025-01-10T09:00:00Z',
    ...overrides,
  };
}

describe('mergeTimeline', () => {
  it('должен вернуть пустой массив при пустых входах', () => {
    expect(mergeTimeline([], [])).toEqual([]);
  });

  it('должен вернуть только комментарии при пустых audit logs', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:00:00Z') as any }),
      makeComment({ id: 'c2', createdAt: new Date('2025-01-10T11:00:00Z') as any }),
    ];
    const result = mergeTimeline(comments, []);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('comment');
    expect(result[0].id).toBe('comment-c1');
    expect(result[1].id).toBe('comment-c2');
  });

  it('должен вернуть только audit logs при пустых комментариях', () => {
    const logs = [
      makeAuditLog({ id: 'a1', createdAt: '2025-01-10T09:00:00Z' }),
      makeAuditLog({ id: 'a2', createdAt: '2025-01-10T10:00:00Z' }),
    ];
    const result = mergeTimeline([], logs);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('audit');
    expect(result[0].id).toBe('audit-a1');
    expect(result[1].id).toBe('audit-a2');
  });

  it('должен объединить и отсортировать хронологически (oldest first)', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:30:00Z') as any }),
    ];
    const logs = [
      makeAuditLog({ id: 'a1', createdAt: '2025-01-10T09:00:00Z' }),
      makeAuditLog({ id: 'a2', createdAt: '2025-01-10T11:00:00Z' }),
    ];
    const result = mergeTimeline(comments, logs);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('audit-a1');
    expect(result[1].id).toBe('comment-c1');
    expect(result[2].id).toBe('audit-a2');
  });

  it('должен дедуплицировать comment:created при совпадении commentId', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:00:00Z') as any }),
    ];
    const logs = [
      makeAuditLog({
        id: 'a1',
        action: 'comment:created' as any,
        createdAt: '2025-01-10T10:00:00Z',
        details: { description: 'Добавлен комментарий', commentId: 'c1' },
      }),
    ];
    const result = mergeTimeline(comments, logs);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('comment');
  });

  it('должен дедуплицировать comment:updated при совпадении commentId', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:00:00Z') as any }),
    ];
    const logs = [
      makeAuditLog({
        id: 'a1',
        action: 'comment:updated' as any,
        createdAt: '2025-01-10T10:05:00Z',
        details: { description: 'Отредактирован комментарий', commentId: 'c1' },
      }),
    ];
    const result = mergeTimeline(comments, logs);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('comment');
  });

  it('должен НЕ дедуплицировать comment:deleted', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:00:00Z') as any }),
    ];
    const logs = [
      makeAuditLog({
        id: 'a1',
        action: 'comment:deleted' as any,
        createdAt: '2025-01-10T10:05:00Z',
        details: { description: 'Удалён комментарий', commentId: 'c1' },
      }),
    ];
    const result = mergeTimeline(comments, logs);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('comment');
    expect(result[1].type).toBe('audit');
  });

  it('должен показать orphan comment:created (commentId не совпадает с комментариями)', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:00:00Z') as any }),
    ];
    const logs = [
      makeAuditLog({
        id: 'a1',
        action: 'comment:created' as any,
        createdAt: '2025-01-10T09:00:00Z',
        details: { description: 'Добавлен комментарий', commentId: 'c-deleted' },
      }),
    ];
    const result = mergeTimeline(comments, logs);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('audit');
    expect(result[1].type).toBe('comment');
  });

  it('должен показать comment:created без commentId в details', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: new Date('2025-01-10T10:00:00Z') as any }),
    ];
    const logs = [
      makeAuditLog({
        id: 'a1',
        action: 'comment:created' as any,
        createdAt: '2025-01-10T09:00:00Z',
        details: { description: 'Добавлен комментарий' },
      }),
    ];
    const result = mergeTimeline(comments, logs);
    expect(result).toHaveLength(2);
  });
});
