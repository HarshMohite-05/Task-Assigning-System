'use client';

import React, { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { formatDate } from '@/lib/format-utils';

export interface TaskUpdate {
  id: string;
  authorId: string;
  authorName: string;
  message: string;
  createdAt: string;
}

interface TaskUpdatesProps {
  taskId: string;
  updates?: TaskUpdate[];
  canPost?: boolean;
  recipientName?: string;
  onPosted?: (update: TaskUpdate) => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${formatDate(d)}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function TaskUpdates({ taskId, updates, canPost = false, recipientName, onPosted }: TaskUpdatesProps) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  const list = updates || [];
  if (!canPost && list.length === 0) return null;

  const send = async () => {
    const message = draft.trim();
    if (!message || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.update) throw new Error(data?.error || 'Failed to send update');
      setDraft('');
      onPosted?.(data.update);
    } catch (err: any) {
      alert(err?.message || 'Failed to send update. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <MessageSquare className="w-3.5 h-3.5" />
            Notes & Replies ({list.length})
          </div>
          {list.map((u) => (
            <div key={u.id} className="bg-sky-50/60 border border-sky-100 rounded-xl px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span className="font-semibold text-slate-700">{u.authorName}</span>
                <span suppressHydrationWarning>{formatTime(u.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-700 whitespace-pre-wrap break-words mt-0.5">{u.message}</p>
            </div>
          ))}
        </div>
      )}

      {canPost && (
        <div className="space-y-1">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-sky-700">
          <MessageSquare className="w-3.5 h-3.5" />
          Reply to {recipientName || 'Director'}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={2}
            maxLength={2000}
            placeholder={`Write a reply or progress note for ${recipientName || 'the director'}...`}
            className="flex-1 min-w-0 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 resize-none"
          />
          <button
            onClick={send}
            disabled={isSending || !draft.trim()}
            className="flex items-center gap-1 text-xs px-3 py-2 rounded-xl font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
        </div>
      )}
    </div>
  );
}
