import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  copyToClipboard, 
  showCopyFeedbackBubble, 
  highlightShortMatch 
} from '../utils';
import { DanbooruTag } from '../types';
import { APP_CONFIG, ASPECT_RATIOS } from '../config/appConfig';
import useIntersectionObserver from '../hooks/useIntersectionObserver';
import { Layers } from 'lucide-react';

interface TagGroupCardProps {
  tag: DanbooruTag;
  searchTerm?: string;
  isTransitioning?: boolean;
  onTagClick?: (tag: DanbooruTag) => void;
  translatedTerm?: string;
  lastTranslatedFor?: string;
  isInTagGroupsContext?: boolean;
}

const TagGroupCard: React.FC<TagGroupCardProps> = ({ tag, searchTerm = '', isTransitioning = false, onTagClick, translatedTerm, lastTranslatedFor, isInTagGroupsContext = false }) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const { isIntersecting } = useIntersectionObserver(undefined, { root: null, rootMargin: '50px', threshold: 0.1 }, cardRef);
  const [loading, setLoading] = useState<boolean>(false);
  const [wikiHtml, setWikiHtml] = useState<string>('');
  const attemptedRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  const title = useMemo(() => {
    const aliasTitle = Array.isArray(tag.words) && tag.words.length > 0 ? tag.words[0] : '';
    if (aliasTitle) return aliasTitle.replace(/^tag_group:/, '').replace(/_/g, ' ');
    return tag.name.replace(/^tag_group:/, '').replace(/_/g, ' ');
  }, [tag.name, tag.words]);

  const highlightedTitle = useMemo(() => {
    const effective = translatedTerm && lastTranslatedFor === searchTerm ? translatedTerm : searchTerm;
    return highlightShortMatch(title, effective);
  }, [title, searchTerm, translatedTerm, lastTranslatedFor]);
  // For tag groups we override the category label to a custom one instead of the generic category name (e.g. Meta)
  const categoryName = useMemo(() => t('ui.tagGroup'), [t]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onTagClick?.(tag);
  }, [onTagClick, tag]);

  /**
   * Manejador de clic derecho para copiar el nombre de la etiqueta del grupo
   */
  const handleRightClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const tagName = tag.name || '';
    const success = await copyToClipboard(tagName);
    
    // Mostrar retroalimentación visual
    showCopyFeedbackBubble(
      success ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
      e.clientX,
      e.clientY,
      success
    );
    
    // Agregar efecto visual temporal a la tarjeta
    const cardElement = e.currentTarget as HTMLElement;
    cardElement.classList.add('ring-2', success ? 'ring-primary' : 'ring-destructive');
    setTimeout(() => {
      cardElement.classList.remove('ring-2', 'ring-primary', 'ring-destructive');
    }, 700);
  }, [tag.name, t]);

  const lastLongPressTimeRef = useRef(0);
  const handleBadgeCopy = useCallback(async (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'contextmenu' && Date.now() - lastLongPressTimeRef.current < 700) return;
  const ok = await copyToClipboard(text);
  showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
    const el = e.currentTarget as HTMLElement;
    el.classList.add('ring-2', ok ? 'ring-primary' : 'ring-destructive');
    setTimeout(()=> el.classList.remove('ring-2','ring-primary','ring-destructive'),700);
  }, [t]);

  // Long press móvil reutilizable
  const groupLongPressTimer = useRef<number | null>(null);
  const groupLongPressTriggered = useRef(false);
  const LONG_PRESS_MS = 550;
  const touchStartHandler = (text: string) => (e: React.TouchEvent) => {
    groupLongPressTriggered.current = false;
  const touchPoint = e.touches[0];
    groupLongPressTimer.current = window.setTimeout(async () => {
      groupLongPressTriggered.current = true;
  const ok = await copyToClipboard(text);
  lastLongPressTimeRef.current = Date.now();
  showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), touchPoint.clientX, touchPoint.clientY, ok);
    }, LONG_PRESS_MS);
  };
  const touchEndHandler = (e: React.TouchEvent) => {
    if (groupLongPressTimer.current) {
      clearTimeout(groupLongPressTimer.current);
      groupLongPressTimer.current = null;
    }
    if (groupLongPressTriggered.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Use aspect ratio configuration when not in tag groups context (for placeholder)
  const aspectRatio = APP_CONFIG.preferredAspectRatio;
  const aspectConfig = ASPECT_RATIOS[aspectRatio];

  // Reset al cambiar de tag
  useEffect(() => {
    setWikiHtml('');
    setLoading(false);
    attemptedRef.current = false;
  }, [tag.name]);

  // Marcar desmontaje para evitar setState tras unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!isIntersecting) return;
      if (attemptedRef.current) return;
      attemptedRef.current = true;
      setLoading(true);
      try {
        const { default: danbooruApi } = await import('../services/danbooruApi');
        const wiki = await danbooruApi.getWikiPageManager().getWikiPage(tag.name);
        if (mountedRef.current && wiki && wiki.formattedFirstParagraph) {
          setWikiHtml(wiki.formattedFirstParagraph);
        }
      } catch {
        // ignore
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    load();
  }, [isIntersecting, tag.name]);

  const members = Array.isArray(tag.words) ? tag.words.slice(1) : [];
  const cleanWord = (w: string) => w.replace(/^tag_group:/, '');
  const remaining = members.slice(5).map(w => cleanWord(w).replace(/_/g, ' ')).join(', ');

  const groupChip = (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg bg-overlay/60 px-1.5 py-0.5 text-xs font-medium text-overlay-foreground/90 shadow-sm"
      title={t('ui.rightClickLongPressCopyCategory')}
      onContextMenu={(e) => handleBadgeCopy(e, categoryName)}
      onTouchStart={touchStartHandler(categoryName)}
      onTouchEnd={touchEndHandler}
    >
      <span className="cat-dot cat-group" aria-hidden="true" />
      {categoryName}
    </span>
  );

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl bg-card text-card-foreground outline-none transition-[transform,box-shadow,opacity] duration-200 ease-out-expo hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_color-mix(in_oklab,var(--primary)_8%,transparent),0_4px_6px_-2px_color-mix(in_oklab,var(--primary)_6%,transparent)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0 ${isTransitioning ? 'opacity-50' : ''}`}
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTagClick?.(tag);
        }
      }}
    >
      {!isInTagGroupsContext && (
        <div className={`relative flex w-full ${aspectConfig.cardHeight} items-center justify-center bg-muted`}>
          <Layers className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} aria-hidden="true" />
          <div className="absolute left-2 top-2 z-20">{groupChip}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-3">
        {isInTagGroupsContext && (
          <div className="flex">
            <span className="cat-badge cat-group">{categoryName}</span>
          </div>
        )}
        <h3 className="line-clamp-2 text-sm font-medium capitalize leading-snug">{highlightedTitle}</h3>

        {members.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {members.slice(0, 5).map((word, idx) => (
              <span
                key={idx}
                className="cat-badge cat-default"
                title={t('ui.rightClickLongPressCopy')}
                onContextMenu={(e) => handleBadgeCopy(e, cleanWord(word))}
                onTouchStart={touchStartHandler(cleanWord(word))}
                onTouchEnd={touchEndHandler}
              >
                {cleanWord(word).replace(/_/g, ' ')}
              </span>
            ))}
            {members.length > 5 && (
              <span
                className="cat-badge cat-default font-mono tabular-nums"
                title={t('ui.rightClickLongPressCopyRemaining')}
                onContextMenu={(e) => handleBadgeCopy(e, remaining)}
                onTouchStart={touchStartHandler(remaining)}
                onTouchEnd={touchEndHandler}
              >
                +{members.length - 5}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto rounded-lg bg-muted/50 p-2">
          {loading ? (
            <div className="space-y-1.5 py-0.5" aria-label={t('common.loading')}>
              <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
            </div>
          ) : wikiHtml ? (
            <div className="wiki-prose line-clamp-3 text-xs leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: wikiHtml }} />
          ) : (
            <p className="text-xs italic text-muted-foreground">{t('ui.noDescription')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagGroupCard;
