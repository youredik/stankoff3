'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus } from 'lucide-react';
import { FieldCard } from './FieldCard';
import type { Section, Field } from '@/types';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

interface SectionCardProps {
  section: Section;
  onEditField: (field: Field) => void;
}

export function SectionCard({ section, onEditField }: SectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);

  const { updateSection, removeSection, removeField, addField } =
    useWorkspaceStore();

  const { setNodeRef, isOver } = useDroppable({
    id: `section-${section.id}`,
    data: {
      type: 'section',
      sectionId: section.id,
    },
  });

  const handleSaveName = () => {
    if (editName.trim()) {
      updateSection(section.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditName(section.name);
      setIsEditing(false);
    }
  };

  const handleAddQuickField = () => {
    const newField: Field = {
      id: `field-${Date.now()}`,
      name: 'Новое поле',
      type: 'text',
      required: false,
    };
    addField(section.id, newField);
    onEditField(newField);
  };

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden transition-colors ${
        isOver ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200'
      }`}
    >
      {/* Section Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleKeyDown}
            className="flex-1 px-2 py-1 text-sm font-medium border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-gray-700">
            {section.name}
          </span>
        )}

        <span className="text-xs text-gray-400">
          {section.fields.length} полей
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
            title="Переименовать"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => removeSection(section.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Удалить секцию"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Section Content */}
      {isExpanded && (
        <div ref={setNodeRef} className="p-4">
          <SortableContext
            items={section.fields.map((f) => `${section.id}::${f.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {section.fields.map((field) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  sectionId={section.id}
                  onEdit={() => onEditField(field)}
                  onRemove={() => removeField(section.id, field.id)}
                />
              ))}
            </div>
          </SortableContext>

          {section.fields.length === 0 && (
            <div className="py-8 text-center border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-sm text-gray-400">
                Перетащите поле сюда или
              </p>
              <button
                onClick={handleAddQuickField}
                className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                добавьте новое
              </button>
            </div>
          )}

          {section.fields.length > 0 && (
            <button
              onClick={handleAddQuickField}
              className="mt-3 flex items-center gap-2 w-full p-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-dashed border-gray-300 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить поле</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
