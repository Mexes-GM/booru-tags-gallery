import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from './LoadingSpinner';
import { DanbooruPost } from '../../types';
import { useImageModal } from '../../context/useImageModal';
import { NSFWBlockedMessage } from './NSFWBlockedMessage';

interface InfinitePostGalleryProps {
  posts: DanbooruPost[];
  nsfwBlockedPosts: Set<number>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  renderCaption?: (post: DanbooruPost) => React.ReactNode;
  emptyMessage?: React.ReactNode;
  error?: string | null;
}

const InfinitePostGallery: React.FC<InfinitePostGalleryProps> = ({
  posts,
  nsfwBlockedPosts,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  renderCaption,
  emptyMessage,
  error,
}) => {
  const { t } = useTranslation();
  const { openModalByPostId } = useImageModal();
  const loadingRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback((post: DanbooruPost) => {
    openModalByPostId(post.id);
  }, [openModalByPostId]);

  // Intersection Observer para detectar cuando el usuario llega al final
  useEffect(() => {
    const loadingElement = loadingRef.current;
    if (!loadingElement || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '100px', // Cargar cuando esté a 100px del final
        threshold: 0.1,
      }
    );

    observer.observe(loadingElement);

    return () => {
      observer.unobserve(loadingElement);
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-destructive-text mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-destructive-text text-sm">{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8">
        {emptyMessage || (
          <>
            <div className="text-muted-foreground/60 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-muted-foreground text-sm mb-2">{t('tags.noExamples')}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="media-gallery grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="dtext-media-embed flex flex-col overflow-hidden rounded-xl bg-card"
          >
            <div className="flex-1 flex items-center justify-center min-h-[120px] media-embed-image p-2">
              {nsfwBlockedPosts.has(post.id) ? (
                <NSFWBlockedMessage postId={post.id} />
              ) : (
                <img
                  src={post.preview_file_url}
                  alt={post.tag_string || ''}
                  className="h-auto max-h-96 w-full cursor-pointer rounded-lg object-contain transition-opacity hover:opacity-90"
                  loading="lazy"
                  onClick={() => handleImageClick(post)}
                  onError={e => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
            </div>
            <div className="media-embed-caption mt-auto p-2 text-xs text-center text-muted-foreground text-balance">
              {renderCaption ? renderCaption(post) : null}
            </div>
          </article>
        ))}
      </div>

      {/* Loading indicator para infinite scroll */}
      <div ref={loadingRef} className="flex items-center justify-center py-4">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <LoadingSpinner size="sm" />
            <span className="text-sm">{t('common.loading')}...</span>
          </div>
        )}
        {!hasMore && posts.length > 10 && (
          <div className="text-center text-muted-foreground text-sm py-4">
            {t('homepage.noMoreResults')}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(InfinitePostGallery);