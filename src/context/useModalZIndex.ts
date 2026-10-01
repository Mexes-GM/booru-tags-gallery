import { createContext, useContext } from 'react';

export type ModalType = 'image' | 'tag';

export interface ModalZIndexContextType {
  getNextZIndex: () => number;
  releaseZIndex: (zIndex: number) => void;
  getModalZIndex: (modalType: ModalType) => number;
  setActiveModal: (modalType: ModalType) => void;
  releaseModal: (modalType: ModalType) => void;
  activeModal: ModalType | null;
}

export const ModalZIndexContext = createContext<ModalZIndexContextType | undefined>(undefined);

export const useModalZIndex = () => {
  const context = useContext(ModalZIndexContext);
  if (!context) {
    throw new Error('useModalZIndex must be used within a ModalZIndexProvider');
  }
  return context;
};
