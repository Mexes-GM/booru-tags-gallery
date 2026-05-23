/**
 * Utilidades comunes para manipulación de strings
 */

/**
 * Normaliza un string reemplazando espacios con guiones bajos y convirtiendo a minúsculas
 * @param str - String a normalizar
 * @returns String normalizado
 */
export const normalize = (str: string): string => {
  return str.replace(/\s+/g, '_').toLowerCase();
};

/**
 * Normaliza un string para comparación removiendo espacios y guiones bajos
 * @param str - String a normalizar
 * @returns String normalizado para comparación
 */
export const normalizeForComparison = (str: string): string => {
  return str.replace(/[_\s]+/g, '').toLowerCase();
};

/**
 * Normaliza un string reemplazando espacios y guiones bajos con guiones bajos
 * @param str - String a normalizar
 * @returns String normalizado
 */
export const normalizeSpacesAndUnderscores = (str: string): string => {
  return str.replace(/[\s_]+/g, '_').toLowerCase();
};