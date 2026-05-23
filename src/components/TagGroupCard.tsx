import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  copyToClipboard, 
  showCopyFeedbackBubble, 
  getCategoryClass, 
  highlightShortMatch 
} from '../utils';
import { DanbooruTag } from '../types';
import { APP_CONFIG, ASPECT_RATIOS } from '../config/appConfig';
import useHoverEffects from '../hooks/useHoverEffects';
import useIntersectionObserver from '../hooks/useIntersectionObserver';
import LoadingSpinner from './common/LoadingSpinner';

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
  const categoryClass = useMemo(() => getCategoryClass(tag.category), [tag.category]);
  // For tag groups we override the category label to a custom one instead of the generic category name (e.g. Meta)
  const categoryName = useMemo(() => t('ui.tagGroup'), [t]);

  const cardHoverEffects = useHoverEffects({
    baseClasses: 'group block bg-[var(--color-searchcard)] dark:bg-[var(--color-searchcard)] rounded-2xl shadow-sm border border-subtle overflow-hidden transition-all duration-200 ease-in-out will-change-transform',
    customHoverClasses: 'hover:shadow-xl hover:border-gray-200 dark:hover:border-gray-600 hover:-translate-y-1 hover:scale-[1.01]',
    scale: false,
    lift: true,
    glow: true,
    transitionDuration: 'fast'
  });

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
    cardElement.classList.add('ring-2', success ? 'ring-green-400' : 'ring-red-400');
    setTimeout(() => {
      cardElement.classList.remove('ring-2', 'ring-green-400', 'ring-red-400');
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
    el.classList.add('ring-2', ok ? 'ring-green-400' : 'ring-red-400');
    setTimeout(()=> el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
    // Silently handle copy failure
  }, []);

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

  return (
    <div ref={cardRef} className={`${cardHoverEffects.hoverClasses} ${isTransitioning ? 'opacity-40 blur-sm' : ''} cursor-pointer`} onClick={handleClick} onContextMenu={handleRightClick} onMouseEnter={cardHoverEffects.handleMouseEnter} onMouseLeave={cardHoverEffects.handleMouseLeave}>
      {!isInTagGroupsContext && (
        /* Placeholder / media section like TagCard */
        <div className={`relative w-full ${aspectConfig.cardHeight} rounded-b-none rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--color-surface-alt)] to-[var(--color-elevated)] dark:from-[var(--color-surface-alt)] dark:to-[var(--color-elevated)] flex items-center justify-center`}>        
          <span className="select-none text-[11px] sm:text-xs tracking-wide font-semibold text-subtle dark:text-secondary uppercase">{t('ui.tagGroup')}</span>
          {/* Badges (overlay) */}
          <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex gap-1 z-20">
            <span
              className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold shadow-sm cursor-pointer ${categoryClass}`}
              title={t('tooltips.rightClickLongPressCopyCategory')}
              onContextMenu={(e)=>handleBadgeCopy(e, categoryName)}
              onTouchStart={touchStartHandler(categoryName)}
              onTouchEnd={touchEndHandler}
            >{categoryName}</span>
          </div>
        </div>
      )}
      {/* Content section */}
      <div className="p-3 sm:p-4">
        {isInTagGroupsContext && (
          /* Header with category badge for tag groups context */
          <div className="flex items-start justify-between mb-3">
            <span
              className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold shadow-sm cursor-pointer ${categoryClass}`}
              title={t('tooltips.rightClickLongPressCopyCategory')}
              onContextMenu={(e)=>handleBadgeCopy(e, categoryName)}
              onTouchStart={touchStartHandler(categoryName)}
              onTouchEnd={touchEndHandler}
            >{categoryName}</span>
          </div>
        )}
  <h3 className="font-bold text-base sm:text-lg text-primary mb-2 line-clamp-2">{highlightedTitle}</h3>
  {/* (Se eliminó el contador de miembros) */}
        {/* Alias chips (excluding first which is group title) */}
        {Array.isArray(tag.words) && tag.words.length > 1 && (
          <div className="mb-2">
            <div className="flex flex-wrap gap-1">
              {tag.words.slice(1, 6).map((word, idx) => (
                <span
                  key={idx}
                  className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-xs cursor-pointer bg-surface-alt dark:bg-elevated text-secondary"
                  title={t('tooltips.rightClickLongPressCopy')}
                  onContextMenu={(e)=>handleBadgeCopy(e, word.replace(/^tag_group:/,''))}
                  onTouchStart={touchStartHandler(word.replace(/^tag_group:/,''))}
                  onTouchEnd={touchEndHandler}
                >
                  {word.replace(/^tag_group:/,'').replace(/_/g,' ')}
                </span>
              ))}
              {tag.words.length > 6 && (
                <span
                  className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-xs cursor-pointer accent-bg"
                  title={t('tooltips.rightClickLongPressCopyRemaining')}
                  onContextMenu={(e)=>handleBadgeCopy(e, tag.words.slice(6).map(w=>w.replace(/^tag_group:/,'').replace(/_/g,' ')).join(', '))}
                  onTouchStart={touchStartHandler(tag.words.slice(6).map(w=>w.replace(/^tag_group:/,'').replace(/_/g,' ')).join(', '))}
                  onTouchEnd={touchEndHandler}
                >+{tag.words.length - 6}</span>
              )}
            </div>
          </div>
        )}
        {/* Wiki excerpt box aligned to TagCard style */}
        {loading ? (
          <div className="mb-2 p-2 sm:p-3 bg-surface-alt dark:bg-elevated rounded-lg">
            <div className="flex items-center gap-1.5 sm:gap-2 text-subtle">
              <LoadingSpinner size="sm" />
              <span className="text-xs">{t('common.loading')}</span>
            </div>
          </div>
        ) : wikiHtml ? (
          <div className="mb-2 p-2 sm:p-3 bg-surface-alt dark:bg-elevated rounded-lg border-l-4 accent border-transparent">
            <div className="text-xs accent font-medium mb-1">Wiki</div>
            <div className="text-xs sm:text-sm text-secondary leading-relaxed prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: wikiHtml }} />
          </div>
        ) : (
          <div className="mb-2 p-2 sm:p-3 bg-surface-alt dark:bg-elevated rounded-lg border-l-4 border-subtle">
            <div className="text-xs text-secondary font-medium mb-1">Wiki</div>
            <div className="text-xs sm:text-sm text-subtle italic">{t('ui.noDescription')}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagGroupCard;
