/**
 * Utilidades para detectar y manejar tags contenedores
 * Los tags contenedores son tags que tienen "Types" en su descripción
 */

export interface ContainerTagInfo {
  isContainer: boolean;
  confidence: number;
  detectedPatterns: string[];
}

/**
 * Detecta si un tag es contenedor basándose en si tiene "Types" en su descripción
 */
export const detectContainerTag = (wikiBody: string): ContainerTagInfo => {
  if (!wikiBody || wikiBody.trim() === '') {
    return {
      isContainer: false,
      confidence: 0,
      detectedPatterns: []
    };
  }

  const detectedPatterns: string[] = [];
  let confidence = 0;

  // 1. Encabezado h4. Types
  const typesPattern = /h[3-6]\.?\s*Types?/i;
  if (typesPattern.test(wikiBody)) {
    const match = wikiBody.match(typesPattern);
    if (match) {
      detectedPatterns.push(`Types section found: ${match[0].trim()}`);
      confidence = 1.0;
    }
  }

  // 2. Al menos 2 bloques [expand=...]
  const expandBlocks = wikiBody.match(/\[expand=[^\]]+\]/gi) || [];
  if (expandBlocks.length >= 2) {
    detectedPatterns.push(`Expand blocks found: ${expandBlocks.length}`);
    confidence = 1.0;
  }

  return {
    isContainer: confidence >= 0.5,
    confidence,
    detectedPatterns
  };
};

/**
 * Obtiene el texto descriptivo para la badge de tag contenedor
 */
export const getContainerTagBadgeText = (containerInfo: ContainerTagInfo): string => {
  if (!containerInfo.isContainer) return '';
  return 'Contenedor';
};

/**
 * Obtiene el color de la badge para tag contenedor
 */
export const getContainerTagBadgeColor = (containerInfo: ContainerTagInfo): string => {
  if (!containerInfo.isContainer) return '';
  return 'bg-purple-100 text-purple-800 border-purple-200';
}; 