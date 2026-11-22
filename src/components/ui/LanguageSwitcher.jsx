import React from 'react';
import { useLang } from '@/lib/LanguageContext';
import { languageNames } from '@/lib/i18n';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-xl gap-1 sm:gap-1.5 px-2 h-10 text-muted-foreground hover:text-foreground" aria-label="Change language">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-medium hidden sm:inline">{languageNames[lang]}</span>
          <span className="text-xs font-semibold uppercase sm:hidden">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl">
        {Object.entries(languageNames).map(([code, name]) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setLang(code)}
            className={`rounded-lg cursor-pointer ${lang === code ? 'text-primary font-semibold' : ''}`}
          >
            {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}