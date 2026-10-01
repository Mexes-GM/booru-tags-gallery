import React, { useState, useEffect, useCallback, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { extractExamplePosts, extractCategorizedExamplePosts, formatDTextAdvanced } from '../utils/dtextFormatter';
import { ensureTagCategoryMap, applyCategoryClassesToLinks } from '../utils/tagCategoryMap';
import { getCategoryColor, getCategoryName, getCategoryClass } from '../utils/categoryUtils';
import { copyToClipboard } from '../utils/copyUtils';
import { showCopyFeedbackBubble } from '../utils/copyFeedbackBubble';
import { formatPostCount } from '../utils/formatUtils';
import LoadingSpinner from './common/LoadingSpinner';
import CopyButton from './ui/CopyButton';
import { DanbooruTag, DanbooruPost, DanbooruWikiPage, DanbooruPreviewImage, LocalTagData } from '../types';
import { loadTagsData, getCachedTags } from '../utils/sharedTagDataLoader';
import { useNSFWFilter } from '../context/useNSFWFilter';
import { usePostImages } from '../hooks/usePostImages';
import { useImageModal } from "../context/useImageModal";
import SEO from './SEO';
import { absoluteUrl } from '../config/site';

// English category names for meta descriptions (the UI label is translated separately).
const SEO_CATEGORY_NAMES: Record<number, string> = {
  0: 'general',
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'meta'
};

// Reduce a DText wiki body to plain prose and return its first sentence (for meta descriptions).
const firstWikiSentence = (body?: string | null): string => {
  if (!body) return '';
  const plain = body
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')    // [[tag|label]] -> label
    .replace(/\[\[([^\]]+)\]\]/g, '$1')               // [[tag]] -> tag
    .replace(/\{\{([^}]+)\}\}/g, '$1')                // {{search}} -> search
    .replace(/"([^"]+)":\[?[^\s\]]+\]?/g, '$1')       // "label":url -> label
    .replace(/!?(post|asset) #\d+/gi, '')             // embedded posts
    .replace(/\[\/?[a-z]+(=[^\]]*)?\]/gi, '')         // [b], [/i], [expand=...]
    .replace(/^h\d\.\s*.*$/gim, '')                   // section headers
    .replace(/^\s*[*#]+\s*/gm, '')                    // list bullets
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  const match = plain.match(/^.+?[.!?](?=\s|$)/);
  return (match ? match[0] : plain).trim();
};

const buildTagDescription = (
  displayName: string,
  tag: DanbooruTag | null,
  wikiBody?: string | null
): string => {
  const parts: string[] = [];
  if (tag) {
    const category = SEO_CATEGORY_NAMES[tag.category];
    const count = typeof tag.post_count === 'number' ? tag.post_count.toLocaleString('en-US') : null;
    parts.push(
      `"${displayName}" is a ${category ? `${category} ` : ''}Danbooru tag${count ? ` with ${count} posts` : ''}.`
    );
  } else {
    parts.push(`"${displayName}" Danbooru tag: wiki, examples and related tags.`);
  }
  const sentence = firstWikiSentence(wikiBody);
  if (sentence) parts.push(sentence);
  const text = parts.join(' ');
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
};

// Carga diferida del componente PostGallery para mejorar el rendimiento inicial
const PostGallery = lazy(() => import('./common/PostGallery'));

interface Artist {
  other_names?: string[];
  url_string?: string;
}

interface RelatedTag {
  0: string;
  1: number;
}

const TagDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { tagName } = useParams<{ tagName: string }>();
  const { isNSFWFilterEnabled } = useNSFWFilter();
  const [tag, setTag] = useState<DanbooruTag | null>(null);
  const [wikiPage, setWikiPage] = useState<DanbooruWikiPage | null>(null);
  const [relatedTags, setRelatedTags] = useState<RelatedTag[]>([]);
  const [posts, setPosts] = useState<DanbooruPost[]>([]);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tagsData, setTagsData] = useState<LocalTagData[]>([]);

  const [examplePosts, setExamplePosts] = useState<number[]>([]);
  const [categorizedExamplePosts, setCategorizedExamplePosts] = useState<Record<string, number[]>>({});
  const [exampleImages, setExampleImages] = useState<DanbooruPreviewImage[]>([]);
  const [currentExampleIndex, setCurrentExampleIndex] = useState<number>(0);

  // Centralizar la carga de imágenes de ejemplo
  const {
    imageMap: postImageMap,
    nsfwBlockedPosts,
    loadImages,
    clearCache: clearImageCache,
  } = usePostImages();

  const { openModalByPostId } = useImageModal();

  const handleImageClick = (postId: number) => {
    openModalByPostId(postId);
  };

  // Load tags data
  useEffect(() => {
    let cancelled = false;
    const existing = getCachedTags();
    if (existing) setTagsData(existing);
    loadTagsData().then(data => { if (!cancelled) setTagsData(data); });
    return () => { cancelled = true; };
  }, []);



  const loadPosts = useCallback(async (page: number = 1) => {
    try {
      const { default: danbooruApi } = await import('../services/danbooruApi');
      const newPosts = await danbooruApi.searchPosts({
        tags: tagName,
        limit: 20,
        page: page,
        order: 'id'
      });

      if (page === 1) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }


    } catch {
      // Error silencioso
    }
  }, [tagName]);

  useEffect(() => {
    const fetchTagDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!tagName) return;

        // Obtener información del tag
        const { default: danbooruApi } = await import('../services/danbooruApi');
        const tagData = await danbooruApi.getTag(decodeURIComponent(tagName));
        if (!tagData) {
          throw new Error('Tag no encontrado');
        }
        setTag(tagData);

        // Obtener página wiki
        try {
          const wikiPages = await danbooruApi.searchWikiPages({
            title: decodeURIComponent(tagName),
            limit: 1
          });
          if (wikiPages.length > 0) {
            setWikiPage(wikiPages[0]);
            ensureTagCategoryMap();
            
            // Extraer posts de ejemplo de la wiki
            const posts = extractExamplePosts(wikiPages[0].body);
            const categorized = extractCategorizedExamplePosts(wikiPages[0].body);
            setExamplePosts(posts);
            setCategorizedExamplePosts(categorized);
            
            // Cargar imágenes de ejemplo
            if (posts.length > 0) {
              
              const images = await Promise.all(
                posts.map(async (_postId: number, index: number) => {
                  try {
                    // Aplicar filtro NSFW si está habilitado
                    const searchParams = isNSFWFilterEnabled ? { "search[rating]": "g" } : undefined;
                    
                    const imageData = await danbooruApi.getWikiExamplePreview(decodeURIComponent(tagName), index, searchParams);
                    
                    if (imageData) {
                    } else {
                    }
                    
                    return imageData;
                  } catch {
                    return null;
                  }
                })
              );
              setExampleImages(images.filter((img): img is DanbooruPreviewImage => img !== null));
            }
          }
        } catch {
          // Error silencioso
        }

        // Obtener tags relacionados
        try {
          const related = await danbooruApi.getRelatedTags(decodeURIComponent(tagName));
          setRelatedTags(related);
        } catch {
          // Error silencioso
        }

        // Si es un artista, obtener información adicional
        if (tagData.category === 1) {
          try {
            const artistData = await danbooruApi.getArtist(decodeURIComponent(tagName));
            setArtist(artistData);
          } catch {
            // Error silencioso
          }
        }

        // Cargar posts iniciales
        await loadPosts(1);

      } catch (error) {
        setError(error instanceof Error ? error.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    if (tagName) {
      fetchTagDetails();
    }
  }, [tagName, loadPosts, isNSFWFilterEnabled]);

  // Aplicar colores de categoría a enlaces dentro del contenido wiki cuando cambia
  useEffect(() => {
    if (!wikiPage) return;
    const observer = new MutationObserver(() => {
      const containers = document.querySelectorAll('[data-wiki-content]');
      containers.forEach(c => applyCategoryClassesToLinks(c as HTMLElement));
    });
    const containers = document.querySelectorAll('[data-wiki-content]');
    containers.forEach(c => applyCategoryClassesToLinks(c as HTMLElement));
    containers.forEach(c => observer.observe(c, { childList: true, subtree: true }));
    return () => observer.disconnect();
  }, [wikiPage]);

  // Cargar imágenes de los posts de ejemplo del wiki cuando cambian
  useEffect(() => {
    if (examplePosts.length > 0) {
      loadImages(examplePosts, isNSFWFilterEnabled ? { nsfwFilter: true, allowedRatings: ['g'] } : {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examplePosts, isNSFWFilterEnabled]);

  // Limpiar caché de imágenes cuando cambia el tag
  useEffect(() => {
    clearImageCache();
  }, [tagName, clearImageCache]);

  const displayName = tag ? tag.name.replace(/_/g, ' ') : decodeURIComponent(tagName || '').replace(/_/g, ' ');
  const pageUrl = absoluteUrl(`/tags/${encodeURIComponent(tag?.name ?? decodeURIComponent(tagName || ''))}`);
  const exampleGroups = Object.entries(categorizedExamplePosts).filter(([, ids]) => ids.length > 0);

  const renderExampleButton = (postId: number, key: React.Key) => {
    const index = examplePosts.indexOf(postId);
    return (
      <button
        type="button"
        key={key}
        className={`break-words rounded-md p-2 text-center font-mono text-xs tabular-nums transition-colors ${
          index === currentExampleIndex ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
        }`}
        onClick={() => { if (index !== -1) setCurrentExampleIndex(index); }}
      >
        #{postId}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center px-4">
          <LoadingSpinner size="xl" color="blue" className="mx-auto mb-3 sm:mb-4" />
          <p className="text-sm text-muted-foreground">{t('modal.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-semibold tracking-tight mb-2">{t('common.error')}</h1>
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <Link to="/" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            {t('navigation.home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <SEO 
        title={displayName}
        description={buildTagDescription(displayName, tag, wikiPage?.body)}
        canonical={pageUrl}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Thing',
          name: displayName,
          description: firstWikiSentence(wikiPage?.body) || undefined,
          url: pageUrl,
          additionalProperty: [
            tag && { '@type': 'PropertyValue', name: 'post_count', value: tag.post_count },
            tag && { '@type': 'PropertyValue', name: 'category', value: SEO_CATEGORY_NAMES[tag.category] ?? tag.category }
          ].filter(Boolean)
        }}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* Header con información del tag */}
        <div className="mb-6 overflow-hidden rounded-xl bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              ← {t('navigation.home')}
            </Link>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h1
                className="mb-2 cursor-pointer break-words text-2xl font-semibold tracking-tight sm:text-4xl"
                title={t('tooltips.rightClickCopyTag')}
                onContextMenu={async (e) => {
                  if (!tag?.name) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const ok = await copyToClipboard(tag.name);
                  showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
                }}
                onTouchStart={(e) => {
                  if (!(tag?.name)) return;
                  const el = e.currentTarget as any;
                  const firstTouch = e.touches[0];
                  const startX = firstTouch?.clientX ?? 0;
                  const startY = firstTouch?.clientY ?? 0;
                  el._pressTimer = setTimeout(async () => {
                    const ok = await copyToClipboard(tag.name);
                    showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), startX, startY, ok);
                    el.lastLongPress = Date.now();
                  }, 550);
                }}
                onTouchEnd={(e) => {
                  const el = e.currentTarget as any;
                  if (el._pressTimer) { clearTimeout(el._pressTimer); el._pressTimer = null; }
                }}
                onTouchCancel={(e) => {
                  const el = e.currentTarget as any;
                  if (el._pressTimer) { clearTimeout(el._pressTimer); el._pressTimer = null; }
                }}
              >
                {tag?.name?.replace(/_/g, ' ') || tagName}
              </h1>
              
              {tag && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
                  <span
                    className={`${getCategoryColor(tag.category)} cursor-pointer`}
                    title={t('tooltips.rightClickCopyCategory')}
                    onContextMenu={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const now = Date.now();
                      if ((e.currentTarget as any).lastLongPress && now - (e.currentTarget as any).lastLongPress < 700) return;
                      const ok = await copyToClipboard(getCategoryName(tag.category));
                      const el = e.currentTarget as HTMLElement;
                      el.classList.add('ring-2', ok ? 'ring-primary':'ring-destructive');
                      showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
                      setTimeout(()=>el.classList.remove('ring-2','ring-primary','ring-destructive'),700);
                    }}
                    onTouchStart={(e) => {
                      const el = e.currentTarget as any;
                      const firstTouch = e.touches[0];
                      const startX = firstTouch?.clientX ?? 0;
                      const startY = firstTouch?.clientY ?? 0;
                      el._pressTimer = setTimeout(async () => {
                        const ok = await copyToClipboard(getCategoryName(tag.category));
                        el.classList.add('ring-2', ok ? 'ring-primary':'ring-destructive');
                        showCopyFeedbackBubble(
                          ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
                          startX,
                          startY,
                          ok
                        );
                        el.lastLongPress = Date.now();
                        setTimeout(()=>el.classList.remove('ring-2','ring-primary','ring-destructive'),700);
                      }, 550);
                    }}
                    onTouchEnd={(e) => {
                      const el = e.currentTarget as any;
                      if (el._pressTimer) {
                        clearTimeout(el._pressTimer);
                        el._pressTimer = null;
                      }
                    }}
                    onTouchCancel={(e) => {
                      const el = e.currentTarget as any;
                      if (el._pressTimer) {
                        clearTimeout(el._pressTimer);
                        el._pressTimer = null;
                      }
                    }}
                  >
                    {getCategoryName(tag.category)}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {formatPostCount(tag.post_count)}
                  </span>
                  <CopyButton text={tag.name} label={t('ui.copyTag')} size="sm" className="sm:ml-auto" />
                </div>
              )}
            </div>
          </div>

          {/* Información del artista */}
          {artist && (
            <div className="mb-4 overflow-hidden rounded-lg bg-muted/50 p-3 sm:p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{getCategoryName(1)}</h3>
              {artist.other_names && artist.other_names.length > 0 && (
                <p className="mb-1 break-words text-sm">
                  <strong>{t('tags.aliases')}:</strong> {artist.other_names.join(', ')}
                </p>
              )}
              {artist.url_string && (
                <p className="break-words text-sm">
                  <strong>{t('tags.viewOnDanbooru')}:</strong>{' '}
                  {artist.url_string.split('\n').map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" 
                       className="mr-2 break-all text-primary-text underline decoration-primary-text/40 underline-offset-[3px]">
                      {url}
                    </a>
                  ))}
                </p>
              )}
            </div>
          )}

          {/* Posts de ejemplo de la wiki */}
          {examplePosts.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-lg bg-muted/50 p-4">
              <h3 className="mb-4 flex items-center break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('tags.examples')} ({examplePosts.length})
              </h3>
              
              {/* Navegación de ejemplos */}
              {exampleImages.length > 1 && (
                <div className="flex items-center justify-center space-x-4 mb-4 flex-wrap gap-2">
                  <button
                    onClick={() => setCurrentExampleIndex((prev) => (prev - 1 + exampleImages.length) % exampleImages.length)}
                    className="h-8 rounded-md bg-secondary px-3 text-sm text-secondary-foreground transition-colors hover:bg-muted"
                  >
                    ← {t('common.previous')}
                  </button>
                  <span className="text-sm whitespace-nowrap text-muted-foreground">
                    <span className="font-mono tabular-nums">{currentExampleIndex + 1} / {exampleImages.length}</span>
                  </span>
                  <button
                    onClick={() => setCurrentExampleIndex((prev) => (prev + 1) % exampleImages.length)}
                    className="h-8 rounded-md bg-secondary px-3 text-sm text-secondary-foreground transition-colors hover:bg-muted"
                  >
                    {t('common.next')} →
                  </button>
                </div>
              )}
              
              {/* Imagen de ejemplo actual */}
              {exampleImages[currentExampleIndex] && (
                <div className="text-center mb-4">
                  <img
                    src={exampleImages[currentExampleIndex].preview_url}
                    alt={`Ejemplo ${currentExampleIndex + 1}`}
                    className="mx-auto max-h-96 max-w-full cursor-pointer rounded-lg transition-opacity hover:opacity-90"
                    onClick={() => handleImageClick(exampleImages[currentExampleIndex].post_id)}
                  />
                  <div className="mt-2 break-words font-mono text-xs tabular-nums text-muted-foreground">
                    <p>Post ID: {exampleImages[currentExampleIndex].post_id}</p>
                    <p>Rating: {exampleImages[currentExampleIndex].rating}</p>
                    <p>Score: {exampleImages[currentExampleIndex].score}</p>
                  </div>
                </div>
              )}
              
              {/* Lista de posts de ejemplo (una sola vez). Si la wiki los agrupa en varias
                  secciones (h4./h5./h6.) se muestran agrupados; si no, como lista plana. */}
              {exampleGroups.length > 1 ? (
                <div className="space-y-3">
                  {exampleGroups.map(([category, ids]) => (
                    <div key={category}>
                      <span className="mb-1 block break-words text-xs font-medium capitalize text-muted-foreground">
                        {category.replace(/_/g, ' ')}
                      </span>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {ids.map((postId, i) => renderExampleButton(postId, `${category}-${postId}-${i}`))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {examplePosts.map((postId) => renderExampleButton(postId, postId))}
                </div>
              )}
            </div>
          )}

          {/* Contenido de la wiki */}
          {wikiPage && wikiPage.body && (
            <div className="overflow-hidden rounded-lg bg-muted/50 p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('tags.wiki')}</h3>
              <div 
                data-wiki-content
                className="wiki-prose max-w-none"
                dangerouslySetInnerHTML={{ 
                  __html: formatDTextAdvanced(
                    wikiPage.body.substring(0, 500) + (wikiPage.body.length > 500 ? '...' : ''),
                    postImageMap,
                    nsfwBlockedPosts
                  )
                }}
              />
            </div>
          )}
        </div>

        {/* Tags relacionados */}
        {relatedTags && relatedTags.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-xl bg-card p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold tracking-tight">{t('tags.related')}</h2>
            <div className="flex flex-wrap gap-2">
              {relatedTags.slice(0, 20).map((relatedTag, index) => {
                // Buscar el tag en los datos locales para obtener la categoría
                const tagData = tagsData.find(
                  (tag) => tag.name === relatedTag[0]
                );
                const categoryClass = tagData ? getCategoryClass(tagData.category) : 'cat-badge cat-default';
                
                return (
                  <Link
                    key={index}
                    to={`/tags/${encodeURIComponent(relatedTag[0])}`}
                    className={`${categoryClass} break-words cursor-pointer`}
                    title={t('tooltips.rightClickCopyTag')}
                    onContextMenu={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const now = Date.now();
                      if ((e.currentTarget as any).lastLongPress && now - (e.currentTarget as any).lastLongPress < 700) return;
                      const ok = await copyToClipboard(relatedTag[0]);
                      const el = e.currentTarget as HTMLElement;
                      el.classList.add('ring-2', ok ? 'ring-primary':'ring-destructive');
                      showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
                      setTimeout(()=>el.classList.remove('ring-2','ring-primary','ring-destructive'),700);
                    }}
                    onTouchStart={(e) => {
                      const el = e.currentTarget as any;
                      const firstTouch = e.touches[0];
                      const startX = firstTouch?.clientX ?? 0;
                      const startY = firstTouch?.clientY ?? 0;
                      el._pressTimer = setTimeout(async () => {
                        const ok = await copyToClipboard(relatedTag[0]);
                        el.classList.add('ring-2', ok ? 'ring-primary':'ring-destructive');
                        showCopyFeedbackBubble(
                          ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
                          startX,
                          startY,
                          ok
                        );
                        el.lastLongPress = Date.now();
                        setTimeout(()=>el.classList.remove('ring-2','ring-primary','ring-destructive'),700);
                      }, 550);
                    }}
                    onTouchEnd={(e) => {
                      const el = e.currentTarget as any;
                      if (el._pressTimer) {
                        clearTimeout(el._pressTimer);
                        el._pressTimer = null;
                      }
                    }}
                    onTouchCancel={(e) => {
                      const el = e.currentTarget as any;
                      if (el._pressTimer) {
                        clearTimeout(el._pressTimer);
                        el._pressTimer = null;
                      }
                    }}
                  >
                    {relatedTag[0].replace(/_/g, ' ')} ({relatedTag[1]})
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Galería de posts */}
  <h2 className="mb-4 text-lg font-semibold tracking-tight">{t('tags.posts')}</h2>
        <React.Suspense fallback={<LoadingSpinner size="lg" color="blue" className="mx-auto my-8" />}>
          <PostGallery
            posts={posts}
            nsfwBlockedPosts={nsfwBlockedPosts}
            isLoading={loading}
            isNSFWFilterEnabled={isNSFWFilterEnabled}
            emptyMessage={<p className="py-8 text-center text-sm text-muted-foreground">{t('tags.noPosts')}</p>}
          />
        </React.Suspense>
      </div>
    </div>
  );
};

export default TagDetailPage;