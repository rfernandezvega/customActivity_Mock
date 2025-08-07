const log = require('./logger');

/**
 * @module journeyUtils
 * @description Funciones de utilidad para procesar datos dentro del contexto de una Custom Activity de Journey Builder.
 */


/**
 * Accede de forma segura a un valor dentro del array 'inArguments' del payload.
 * La configuración de la Custom Activity se guarda en un array llamado 'inArguments'.
 * Esta función simplemente recupera el valor de una clave específica del primer objeto de ese array.
 *
 * @param {Array<object>} inArgs - El array 'inArguments' del payload de la actividad.
 * @param {string} fieldName - El nombre de la clave (propiedad) cuyo valor se quiere obtener.
 * @returns {any|null} - El valor del campo solicitado, o null si 'inArguments' está vacío.
 */
function getInArgValue(inArgs, fieldName) {
  if (!inArgs || !Array.isArray(inArgs) || inArgs.length === 0) {
    return null;
  }
  
  // La configuración siempre se encuentra en el primer elemento del array.
  const argObject = inArgs[0];
  return argObject[fieldName];
}



module.exports =  getInArgValue;