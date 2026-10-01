import React, { useState, useCallback, ReactNode } from 'react';
import { ModalZIndexContext, type ModalType, type ModalZIndexContextType } from './useModalZIndex';

interface ModalZIndexProviderProps {
  children: ReactNode;
}

const BASE_Z_INDEX = 1000;
const ACTIVE_MODAL_Z_INDEX = 1200;
const BACKGROUND_MODAL_Z_INDEX = 1100;

export const ModalZIndexProvider: React.FC<ModalZIndexProviderProps> = ({ children }) => {
  const [currentZIndex, setCurrentZIndex] = useState(BASE_Z_INDEX);
  const [usedZIndexes] = useState<Set<number>>(new Set());
  const [activeModal, setActiveModalState] = useState<ModalType | null>(null);
  const [openModals, setOpenModals] = useState<Set<ModalType>>(new Set());

  const getNextZIndex = useCallback((): number => {
    const nextZIndex = currentZIndex + 1;
    setCurrentZIndex(nextZIndex);
    usedZIndexes.add(nextZIndex);
    return nextZIndex;
  }, [currentZIndex, usedZIndexes]);

  const releaseZIndex = useCallback((zIndex: number) => {
    usedZIndexes.delete(zIndex);
  }, [usedZIndexes]);

  const getModalZIndex = useCallback((modalType: ModalType): number => {
    if (activeModal === modalType) {
      return ACTIVE_MODAL_Z_INDEX;
    } else if (openModals.has(modalType)) {
      return BACKGROUND_MODAL_Z_INDEX;
    }
    return BACKGROUND_MODAL_Z_INDEX;
  }, [activeModal, openModals]);

  const setActiveModal = useCallback((modalType: ModalType) => {
    setOpenModals(prev => {
      const newSet = new Set(prev);
      newSet.add(modalType);
      return newSet;
    });
    setActiveModalState(modalType);
  }, []);

  const releaseModal = useCallback((modalType: ModalType) => {
    setOpenModals(prev => {
      const newSet = new Set(prev);
      newSet.delete(modalType);
      return newSet;
    });
    
    setActiveModalState(prev => prev === modalType ? null : prev);
  }, []);

  const value: ModalZIndexContextType = {
    getNextZIndex,
    releaseZIndex,
    getModalZIndex,
    setActiveModal,
    releaseModal,
    activeModal
  };

  return (
    <ModalZIndexContext.Provider value={value}>
      {children}
    </ModalZIndexContext.Provider>
  );
};