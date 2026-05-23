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
import { DanbooruTag, DanbooruPost, DanbooruWikiPage, DanbooruPreviewImage, LocalTagData } from '../types';
import { loadTagsData, getCachedTags } from '../utils/sharedTagDataLoader';
import { useNSFWFilter } from '../context/useNSFWFilter';
import { usePostImages } from '../hooks/usePostImages';
import { useImageModal } from "../context/useImageModal";
import SEO from './SEO';

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
                  } catch (error) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center px-4">
          <LoadingSpinner size="xl" color="blue" className="mx-auto mb-3 sm:mb-4" />
          <p className="text-gray-600 dark:text-slate-400 text-sm sm:text-base">{t('modal.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-red-500 text-4xl sm:text-6xl mb-3 sm:mb-4">⚠️</div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary mb-2">{t('common.error')}</h1>
          <p className="text-gray-600 dark:text-slate-400 mb-3 sm:mb-4 text-sm sm:text-base">{error}</p>
          <Link to="/" className="bg-blue-500 text-white px-3 sm:px-4 py-2 rounded hover:bg-blue-600 text-sm sm:text-base">
            {t('navigation.home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <SEO 
        title={tag ? tag.name.replace(/_/g, ' ') : tagName}
        description={wikiPage?.body ? wikiPage.body.replace(/\n/g,' ').slice(0,155) + (wikiPage.body.length>155?'…':'') : `Información, wiki, ejemplos e imágenes para el tag ${tagName}`}
        canonical={`https://danbooru-tags-explorer.netlify.app/tags/${encodeURIComponent(tagName || '')}`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Thing',
          name: tag ? tag.name.replace(/_/g,' ') : tagName,
          description: wikiPage?.body ? wikiPage.body.slice(0,500) : undefined,
          url: `https://danbooru-tags-explorer.netlify.app/tags/${encodeURIComponent(tagName || '')}`,
          additionalProperty: [
            tag && { '@type': 'PropertyValue', name: 'post_count', value: tag.post_count },
            tag && { '@type': 'PropertyValue', name: 'category', value: tag.category }
          ].filter(Boolean)
        }}
      />
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-full overflow-hidden">
        {/* Header con información del tag */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm sm:text-base">
              ← {t('navigation.home')}
            </Link>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h1
                className="text-2xl sm:text-3xl font-bold text-primary mb-2 break-words cursor-pointer"
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
                    className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium border cursor-pointer transition-all ${getCategoryColor(tag.category)} break-words`}
                    title={t('tooltips.rightClickCopyCategory')}
                    onContextMenu={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const now = Date.now();
                      if ((e.currentTarget as any).lastLongPress && now - (e.currentTarget as any).lastLongPress < 700) return;
                      const ok = await copyToClipboard(getCategoryName(tag.category));
                      const el = e.currentTarget as HTMLElement;
                      el.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
                      showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
                      setTimeout(()=>el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
                    }}
                    onTouchStart={(e) => {
                      const el = e.currentTarget as any;
                      const firstTouch = e.touches[0];
                      const startX = firstTouch?.clientX ?? 0;
                      const startY = firstTouch?.clientY ?? 0;
                      el._pressTimer = setTimeout(async () => {
                        const ok = await copyToClipboard(getCategoryName(tag.category));
                        el.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
                        showCopyFeedbackBubble(
                          ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
                          startX,
                          startY,
                          ok
                        );
                        el.lastLongPress = Date.now();
                        setTimeout(()=>el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
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
                  <span className="text-base sm:text-lg font-semibold text-gray-700 dark:text-slate-300">
                    {formatPostCount(tag.post_count)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Información del artista */}
          {artist && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 overflow-hidden">
              <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('tags.category')}</h3>
              {artist.other_names && artist.other_names.length > 0 && (
                <p className="text-sm text-green-700 dark:text-green-400 mb-1 break-words">
                  <strong>{t('tags.aliases')}:</strong> {artist.other_names.join(', ')}
                </p>
              )}
              {artist.url_string && (
                <p className="text-sm text-green-700 dark:text-green-400 break-words">
                  <strong>{t('tags.viewOnDanbooru')}:</strong>{' '}
                  {artist.url_string.split('\n').map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" 
                       className="text-blue-600 dark:text-blue-400 hover:underline mr-2 break-all">
                      {url}
                    </a>
                  ))}
                </p>
              )}
            </div>
          )}

          {/* Posts de ejemplo de la wiki */}
          {examplePosts.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-4 overflow-hidden">
              <h3 className="font-semibold text-green-800 dark:text-green-300 mb-4 flex items-center break-words">
                📚 {t('tags.examples')} ({examplePosts.length})
              </h3>
              
              {/* Navegación de ejemplos */}
              {exampleImages.length > 1 && (
                <div className="flex items-center justify-center space-x-4 mb-4 flex-wrap gap-2">
                  <button
                    onClick={() => setCurrentExampleIndex((prev) => (prev - 1 + exampleImages.length) % exampleImages.length)}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                  >
                    ← {t('common.previous')}
                  </button>
                  <span className="text-sm font-medium whitespace-nowrap">
                    {currentExampleIndex + 1} de {exampleImages.length}
                  </span>
                  <button
                    onClick={() => setCurrentExampleIndex((prev) => (prev + 1) % exampleImages.length)}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
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
                    className="max-w-full max-h-96 mx-auto rounded-lg shadow-lg cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleImageClick(exampleImages[currentExampleIndex].post_id)}
                  />
                  <div className="mt-2 text-sm text-gray-600 dark:text-slate-400 break-words">
                    <p>Post ID: {exampleImages[currentExampleIndex].post_id}</p>
                    <p>Rating: {exampleImages[currentExampleIndex].rating}</p>
                    <p>Score: {exampleImages[currentExampleIndex].score}</p>
                  </div>
                </div>
              )}
              
              {/* Lista de todos los posts de ejemplo */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {examplePosts.map((postId, index) => (
                  <div
                    key={postId}
                    className={`p-2 rounded text-center cursor-pointer text-sm break-words ${
                        index === currentExampleIndex ? 'bg-green-500 text-white' : 'bg-white dark:bg-slate-700 hover:bg-green-100 dark:hover:bg-green-900/30'
                      }`}
                    onClick={() => setCurrentExampleIndex(index)}
                  >
                    #{postId}
                  </div>
                ))}
              </div>
              
              {/* Posts por categorías */}
              {Object.keys(categorizedExamplePosts).length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-green-700 dark:text-green-400 mb-2">{t('tags.category')}:</h4>
                  {Object.entries(categorizedExamplePosts).map(([category, posts]) => (
                    <div key={category} className="mb-2">
                      <span className="text-sm font-medium status-success capitalize break-words">{category}:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {posts.map((postId) => (
                          <span
                            key={postId}
                            className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 break-words"
                            onClick={() => {
                              const index = examplePosts.indexOf(postId);
                              if (index !== -1) setCurrentExampleIndex(index);
                            }}
                          >
                            #{postId}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contenido de la wiki */}
          {wikiPage && wikiPage.body && (
            <div className="bg-surface-alt dark:bg-elevated border-l-4 accent border-transparent rounded-lg p-4 overflow-hidden">
              <h3 className="font-semibold accent mb-2">{t('tags.wiki')}</h3>
              <div 
                data-wiki-content
                className="text-sm text-secondary prose prose-sm dark:prose-invert max-w-none break-words"
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
          <div className="bg-surface dark:bg-surface rounded-lg shadow-md p-6 mb-6 overflow-hidden">
            <h2 className="text-xl font-bold text-primary mb-4">{t('tags.related')}</h2>
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
                    className={`${categoryClass} hover:opacity-80 transition-colors duration-150 break-words cursor-pointer`}
                    title={t('tooltips.rightClickCopyTag')}
                    onContextMenu={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const now = Date.now();
                      if ((e.currentTarget as any).lastLongPress && now - (e.currentTarget as any).lastLongPress < 700) return;
                      const ok = await copyToClipboard(relatedTag[0]);
                      const el = e.currentTarget as HTMLElement;
                      el.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
                      showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
                      setTimeout(()=>el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
                    }}
                    onTouchStart={(e) => {
                      const el = e.currentTarget as any;
                      const firstTouch = e.touches[0];
                      const startX = firstTouch?.clientX ?? 0;
                      const startY = firstTouch?.clientY ?? 0;
                      el._pressTimer = setTimeout(async () => {
                        const ok = await copyToClipboard(relatedTag[0]);
                        el.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
                        showCopyFeedbackBubble(
                          ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
                          startX,
                          startY,
                          ok
                        );
                        el.lastLongPress = Date.now();
                        setTimeout(()=>el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
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
  <h2 className="text-xl font-bold text-primary mb-4">{t('tags.posts')}</h2>
        <React.Suspense fallback={<LoadingSpinner size="lg" color="blue" className="mx-auto my-8" />}>
          <PostGallery
            posts={posts}
            nsfwBlockedPosts={nsfwBlockedPosts}
            isLoading={loading}
            isNSFWFilterEnabled={isNSFWFilterEnabled}
            emptyMessage={<p className="text-gray-500 dark:text-slate-400 text-center py-8">{t('tags.noPosts')}</p>}
          />
        </React.Suspense>
      </div>
    </div>
  );
};

export default TagDetailPage;