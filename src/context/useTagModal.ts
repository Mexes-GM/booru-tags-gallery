import { useContext } from 'react'
import { TagModalContext, TagModalContextType } from './TagModalContext'

export const useTagModal = (): TagModalContextType => {
  const context = useContext(TagModalContext);
  if (context === undefined) {
    throw new Error('useTagModal must be used within a TagModalProvider');
  }
  return context;
}; 