import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from './LoadingSpinner';
import { DanbooruPost } from '../../types';
import { useImageModal } from '../../context/useImageModal';
import { NSFWBlockedMessage } from './NSFWBlockedMessage';

interface PostGalleryProps {
  posts: DanbooruPost[];
  nsfwBlockedPosts: Set<number>;
  isLoading: boolean;
  isNSFWFilterEnabled?: boolean;
  renderCaption?: (post: DanbooruPost) => React.ReactNode;
  emptyMessage?: React.ReactNode;
}

const PostGallery: React.FC<PostGalleryProps> = ({
  posts,
  nsfwBlockedPosts,
  isLoading,
  isNSFWFilterEnabled = false,
  renderCaption,
  emptyMessage,
}) => {
  const { t } = useTranslation();
  const { openModalByPostId } = useImageModal();

  const handleImageClick = useCallback((post: DanbooruPost) => {
    openModalByPostId(post.id);
  }, [openModalByPostId]);
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (posts.length > 0) {
    return (
      <div className="media-gallery grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4 h-full">
        {posts.map((post) => (
          <article
            key={post.id}
            className="dtext-media-embed flex flex-col bg-white dark:bg-gray-800 rounded shadow overflow-hidden"
          >
            <div className="flex-1 flex items-center justify-center min-h-[120px] media-embed-image p-2">
              {nsfwBlockedPosts.has(post.id) ? (
                <NSFWBlockedMessage postId={post.id} />
              ) : (
                <img
                  src={post.preview_file_url}
                  alt={post.tag_string || ''}
                  className="rounded shadow object-contain max-h-96 w-full h-auto cursor-pointer hover:opacity-80 transition-opacity"
                  loading="lazy"
                  onClick={() => handleImageClick(post)}
                  onError={e => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
            </div>
            <div className="media-embed-caption mt-auto p-2 text-xs text-center text-gray-500 dark:text-gray-400 text-balance">
              {renderCaption ? renderCaption(post) : null}
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="text-center py-8">
      <div className="text-gray-400 mb-2">
        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      {emptyMessage ? emptyMessage : (
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">{t('tags.noExamples')}</p>
      )}
      {isNSFWFilterEnabled && (
        <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-600 rounded px-3 py-2 inline-block">
          <strong>{t('common.error')}:</strong> {t('nsfw.blockedDescription')}
        </div>
      )}
    </div>
  );
};

export default React.memo(PostGallery);