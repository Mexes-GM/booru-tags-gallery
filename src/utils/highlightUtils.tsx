import React from 'react';
import { normalizeForComparison } from './stringUtils';

/**
 * Encuentra todas las subcadenas comunes significativas entre dos strings
 * @param str1 Primer string
 * @param str2 Segundo string
 * @param minLength Longitud mínima de las subcadenas (por defecto 3)
 * @returns Array de subcadenas comunes ordenadas por longitud descendente
 */
function findAllCommonSubstrings(
  str1: string, 
  str2: string, 
  minLength: number = 3
): Array<{ substring: string; start1: number; start2: number; length: number }> {
  const lowerStr1 = str1.toLowerCase();
  const lowerStr2 = str2.toLowerCase();
  const results: Array<{ substring: string; start1: number; start2: number; length: number }> = [];
  
  // Buscar subcadenas de diferentes longitudes
  for (let len = Math.min(lowerStr1.length, lowerStr2.length); len >= minLength; len--) {
    for (let i = 0; i <= lowerStr1.length - len; i++) {
      const substr1 = lowerStr1.substring(i, i + len);
      for (let j = 0; j <= lowerStr2.length - len; j++) {
        const substr2 = lowerStr2.substring(j, j + len);
        if (substr1 === substr2) {
          // Verificar que no se solape con resultados existentes
          const overlaps = results.some(result => 
            (i >= result.start1 && i < result.start1 + result.length) ||
            (result.start1 >= i && result.start1 < i + len)
          );
          
          if (!overlaps) {
            results.push({
              substring: str1.substring(i, i + len),
              start1: i,
              start2: j,
              length: len
            });
          }
        }
      }
    }
  }
  
  return results.sort((a, b) => b.length - a.length);
}

/**
 * Resalta las partes similares entre el término de búsqueda y el texto
 * @param text Texto a resaltar
 * @param searchTerm Término de búsqueda
 * @param highlightClass Clase CSS para el resaltado
 * @returns ReactNode con el texto resaltado
 */
function highlightSimilarParts(
  text: string, 
  searchTerm: string, 
  highlightClass: string
): React.ReactNode {
  if (!searchTerm || searchTerm.length < 2) return text;
  if (searchTerm.length > 20 || text.length > 100) return text;
  
  const lowerText = text.toLowerCase();
  const lowerSearchTerm = searchTerm.toLowerCase();
  
  // Normalizamos ambos strings para manejar espacios y guiones bajos
  const normalizedText = normalizeForComparison(text);
  const normalizedSearch = normalizeForComparison(searchTerm);
  
  // Coincidencia exacta (normalizada)
  if (normalizedText === normalizedSearch) {
    return <mark className={highlightClass}>{text}</mark>;
  }
  
  // Coincidencia de prefijo (normalizada) - resaltar solo la parte que coincide
  if (normalizedText.startsWith(normalizedSearch)) {
    // Encontrar la posición donde termina la coincidencia en el texto original
    let prefixLength = 0;
    let normalizedPos = 0;
    
    for (let i = 0; i < text.length && normalizedPos < normalizedSearch.length; i++) {
      const char = text[i];
      const normalizedChar = (char === ' ' || char === '_') ? '_' : char.toLowerCase();
      
      if (normalizedChar === normalizedSearch[normalizedPos]) {
        normalizedPos++;
      }
      prefixLength++;
    }
    
    const before = text.substring(0, prefixLength);
    const after = text.substring(prefixLength);
    return (
      <>
        <mark className={highlightClass}>{before}</mark>
        {after}
      </>
    );
  }
  
  // Coincidencia de prefijo inverso (normalizada)
  if (normalizedSearch.startsWith(normalizedText)) {
    return <mark className={highlightClass}>{text}</mark>;
  }
  
  // Dividir en palabras considerando espacios y guiones bajos
  const searchWords = searchTerm.toLowerCase().split(/[\s_]+/).filter(word => word.length > 0);
  const textWords = text.split(/[\s_]+/);
  
  if (searchWords.length > 1) {
    // Búsqueda multi-palabra: destacar palabras que coincidan
    const highlightedWords = textWords.map((word, index) => {
      const lowerWord = word.toLowerCase();
      
      // Verificar si esta palabra coincide con alguna palabra de búsqueda
      const matchingSearchWord = searchWords.find(searchWord => 
        lowerWord.includes(searchWord) || searchWord.includes(lowerWord)
      );
      
      if (matchingSearchWord) {
        // Si la palabra contiene la palabra de búsqueda, destacar solo esa parte
        const wordLower = word.toLowerCase();
        const searchWordLower = matchingSearchWord.toLowerCase();
        const matchIndex = wordLower.indexOf(searchWordLower);
        
        if (matchIndex !== -1) {
          const before = word.substring(0, matchIndex);
          const match = word.substring(matchIndex, matchIndex + matchingSearchWord.length);
          const after = word.substring(matchIndex + matchingSearchWord.length);
          
          return (
            <span key={index}>
              {before}
              <mark className={highlightClass}>{match}</mark>
              {after}
            </span>
          );
        } else {
          // Coincidencia completa de palabra
          return <mark key={index} className={highlightClass}>{word}</mark>;
        }
      }
      
      return word;
    });
    
    // Reconstruir el texto con las palabras resaltadas
    return highlightedWords.reduce((acc, word, index) => {
      if (index === 0) return word;
      const originalSeparator = text.match(/[\s_]+/g)?.[index - 1] || '_';
      return <>{acc}{originalSeparator}{word}</>;
    }, <></>);
  }
  
  // Búsqueda de una sola palabra: lógica original
  // Coincidencia exacta
  if (lowerText === lowerSearchTerm) {
    return <mark className={highlightClass}>{text}</mark>;
  }
  
  // Coincidencia de prefijo
  if (lowerText.startsWith(lowerSearchTerm)) {
    const before = text.substring(0, searchTerm.length);
    const after = text.substring(searchTerm.length);
    return (
      <>
        <mark className={highlightClass}>{before}</mark>
        {after}
      </>
    );
  }
  
  // Coincidencia de prefijo inverso
  if (lowerSearchTerm.startsWith(lowerText)) {
    return <mark className={highlightClass}>{text}</mark>;
  }
  
  // Buscar subcadenas comunes significativas
  const commonSubstrings = findAllCommonSubstrings(text, searchTerm, 3);
  
  if (commonSubstrings.length > 0) {
    const bestMatch = commonSubstrings[0];
    
    if (bestMatch.length >= 3) {
      const before = text.substring(0, bestMatch.start1);
      const match = text.substring(bestMatch.start1, bestMatch.start1 + bestMatch.length);
      const after = text.substring(bestMatch.start1 + bestMatch.length);
      
      return (
        <>
          {before}
          <mark className={highlightClass}>{match}</mark>
          {after}
        </>
      );
    }
  }
  
  // Buscar coincidencias en palabras individuales
  const words = text.split(/[\s_]+/);
  const highlightedWords = words.map((word, index) => {
    const lowerWord = word.toLowerCase();
    
    // Coincidencia exacta de palabra
    if (lowerWord === lowerSearchTerm) {
      return <mark key={index} className={highlightClass}>{word}</mark>;
    }
    
    // Palabra que comienza con el término de búsqueda
    if (lowerWord.startsWith(lowerSearchTerm)) {
      const before = word.substring(0, searchTerm.length);
      const after = word.substring(searchTerm.length);
      return (
        <span key={index}>
          <mark className={highlightClass}>{before}</mark>
          {after}
        </span>
      );
    }
    
    // Buscar subcadenas comunes entre la palabra y el término de búsqueda
    const wordCommonSubstrings = findAllCommonSubstrings(word, searchTerm, 3);
    if (wordCommonSubstrings.length > 0) {
      const bestWordMatch = wordCommonSubstrings[0];
      if (bestWordMatch.length >= 3) {
        const before = word.substring(0, bestWordMatch.start1);
        const match = word.substring(bestWordMatch.start1, bestWordMatch.start1 + bestWordMatch.length);
        const after = word.substring(bestWordMatch.start1 + bestWordMatch.length);
        
        return (
          <span key={index}>
            {before}
            <mark className={highlightClass}>{match}</mark>
            {after}
          </span>
        );
      }
    }
    
    return word;
  });
  
  // Reconstruir el texto con las palabras resaltadas
  return highlightedWords.reduce((acc, word, index) => {
    if (index === 0) return word;
    const separator = text.match(/[\s_]+/g)?.[index - 1] || ' ';
    return <>{acc}{separator}{word}</>;
  }, <></>);
}

// Función highlightMatch eliminada - no se usaba en el proyecto

/**
 * Función principal para resaltar coincidencias en TagCard
 * Usa algoritmo de similitud de caracteres para encontrar partes similares
 */
export const highlightShortMatch = (text: string, searchTerm: string): string | React.ReactNode => {
  return highlightSimilarParts(text, searchTerm, 'search-hit');
}

/**
 * Función principal para resaltar coincidencias en SearchBar
 * Usa algoritmo de similitud de caracteres para encontrar partes similares
 */
export const highlightSearchMatch = (text: string, searchTerm: string): string | React.ReactNode => {
  return highlightSimilarParts(text, searchTerm, 'search-hit');
}