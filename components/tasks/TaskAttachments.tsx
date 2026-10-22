'use client';

import React from 'react';
import { Paperclip, Mic, FileText, Image as ImageIcon } from 'lucide-react';
import { formatFileSize } from '@/lib/format-utils';

export interface TaskAttachment {
  id: string;
  kind: 'FILE' | 'VOICE';
  fileName: string;
  mimeType: string;
  size: number;
}

interface TaskAttachmentsProps {
  taskId: string;
  attachments?: TaskAttachment[];
  compact?: boolean;
}

export function attachmentUrl(taskId: string, attachmentId: string) {
  return `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export default function TaskAttachments({ taskId, attachments, compact = false }: TaskAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  const voiceNotes = attachments.filter((a) => a.kind === 'VOICE');
  const files = attachments.filter((a) => a.kind !== 'VOICE');

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2 mt-2'}>
      {voiceNotes.map((a, i) => (
        <div
          key={a.id}
          className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-2.5 py-1.5"
        >
          <Mic className="w-3.5 h-3.5 text-violet-600 shrink-0" />
          <span className="text-[11px] font-semibold text-violet-700 shrink-0">
            Voice note{voiceNotes.length > 1 ? ` ${i + 1}` : ''}
          </span>
          <audio
            controls
            preload="none"
            src={attachmentUrl(taskId, a.id)}
            className="h-8 w-full min-w-0"
          />
        </div>
      ))}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((a) => {
            const isImage = a.mimeType.startsWith('image/');
            const Icon = isImage ? ImageIcon : a.mimeType === 'application/pdf' ? FileText : Paperclip;
            return (
              <a
                key={a.id}
                href={attachmentUrl(taskId, a.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 max-w-full text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg px-2 py-1 transition"
                title={`Open ${a.fileName}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[180px]">{a.fileName}</span>
                <span className="text-slate-400 shrink-0">{formatFileSize(a.size)}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
