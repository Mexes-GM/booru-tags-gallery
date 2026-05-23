import { useContext } from 'react';
import { ImageModalContext, ImageModalContextType } from './ImageModalContext';

export const useImageModal = (): ImageModalContextType => {
  const context = useContext(ImageModalContext);
  if (context === undefined) {
    throw new Error('useImageModal must be used within an ImageModalProvider');
  }
  return context;
};