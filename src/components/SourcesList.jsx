import React from 'react';
import { ExternalLink } from 'lucide-react';

/** Web sources Google Search grounding used for an AI answer. */
export default function SourcesList({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="px-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sources</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 max-w-full text-xs px-2.5 py-1 rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="truncate max-w-[200px]">{s.title}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}
