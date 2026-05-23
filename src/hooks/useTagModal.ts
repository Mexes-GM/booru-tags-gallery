import { useState, useCallback } from 'react';
import { DanbooruTag } from '../types';

interface UseTagModalReturn {
  selectedTag: DanbooruTag | null;
  isModalOpen: boolean;
  openModal: (tag: DanbooruTag) => void;
  closeModal: () => void;
}

const useTagModal = (): UseTagModalReturn => {
  const [selectedTag, setSelectedTag] = useState<DanbooruTag | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const openModal = useCallback((tag: DanbooruTag) => {
    setSelectedTag(tag);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Limpiar el tag seleccionado después de un pequeño delay para permitir la animación de salida
    setTimeout(() => {
      setSelectedTag(null);
    }, 300);
  }, []);

  return {
    selectedTag,
    isModalOpen,
    openModal,
    closeModal
  };
};

export default useTagModal; 