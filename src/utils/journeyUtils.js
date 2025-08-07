const log = require('./logger');

/**
 * @module journeyUtils
 * @description Funciones de utilidad para procesar datos dentro del contexto de una Custom Activity de Journey Builder.
 */

/**
 * Resuelve un data binding de Journey Builder para obtener su valor real.
 * Esta función toma una cadena de data binding (ej: "{{Event.APIEvent-XYZ.FirstName}}")
 * y navega a través del objeto de datos del Journey (payload) para encontrar el valor correspondiente (ej: "John").
 * También maneja valores que no son bindings (texto estático) y tiene un mecanismo de fallback
 * para buscar campos por su nombre si la ruta completa falla.
 *
 * @param {string} binding - La cadena a resolver. Puede ser un data binding de Journey Builder o texto plano.
 * @param {object} data - El objeto completo de datos del Journey (el payload decodificado) que contiene los valores del contacto.
 * @returns {string|null} - El valor resuelto del binding, o null si no se encuentra.
 */
function extractDataBindingValue(binding, data) {
  if (!binding || typeof binding !== 'string' || binding.trim() === '') {
    return null;
  }
  
  // Si es una referencia de data binding con formato {{...}}
  if (binding.startsWith('{{') && binding.endsWith('}}')) {
    const path = binding.slice(2, -2); // Quitar {{ y }}
    const parts = path.split('.');
    
    // El binding debe comenzar con "Event." para ser procesado.
    if (parts.length >= 2 && parts[0] === 'Event') {
      // La ruta principal para los datos del evento de entrada es data.Event
      if (data.Event) {
        try {
          // Navegar a través de la ruta del objeto (ej: Event.APIEvent-XYZ.FirstName) para encontrar el valor.
          let currentObj = data.Event;
          for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (currentObj && currentObj[part] !== undefined) {
              currentObj = currentObj[part];
            } else {
              return null; // Si un paso de la ruta no existe, el valor no se puede encontrar.
            }
          }
          return currentObj;
        } catch (error) {
          log(`Error al extraer valor de binding con ruta completa: ${error.message}`);
          return null;
        }
      } else {
        // Mecanismo de Fallback: si data.Event no existe, intentar buscar por el nombre del campo.
        // Esto es útil para la función de personalización (personalizeText).
        const fieldName = parts[parts.length - 1];
        
        // Función recursiva para buscar una clave en cualquier nivel del objeto de datos.
        const searchInObject = (obj, field) => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj[field] !== undefined) return obj[field]; // Propiedad encontrada
          
          for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const result = searchInObject(obj[key], field);
              if (result !== null) return result;
            }
          }
          return null;
        };
        
        return searchInObject(data, fieldName);
      }
    }
  } else if (binding.trim() !== '') {
    // Si no es un binding (es texto plano, como un ID de template estático), devolver el valor tal cual.
    return binding;
  }
  
  return null;
}

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

/**
 * Busca y reemplaza placeholders del tipo %%FieldName%% en un texto de plantilla.
 * Esta función permite la personalización de mensajes. Recorre un texto en busca de
 * cualquier cadena encerrada en `%%...%%`, extrae el nombre del campo y utiliza `extractDataBindingValue`
 * para encontrar el valor correspondiente en los datos del contacto.
 *
 * @param {string} text - El texto de la plantilla (ej: "Hola %%FirstName%%, tu código es...").
 * @param {object} dataContext - El objeto de datos completo del contacto (el activityPayload decodificado).
 * @returns {string} - El texto con los placeholders reemplazados por los valores reales del contacto.
 */
function personalizeText(text, dataContext) {
  log("Personalizando mensaje");
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Expresión regular para encontrar todas las ocurrencias de %%...%% de forma no codiciosa (non-greedy).
  return text.replace(/%%(.*?)%%/g, (match, fieldName) => {
    // 'match' es el placeholder completo (ej: "%%FirstName%%")
    // 'fieldName' es solo el contenido (ej: "FirstName")
    
    const fieldNameToFind = fieldName.trim();
    
    // Se crea un "data binding falso" para que la función extractDataBindingValue use su
    // mecanismo de fallback y busque el campo por su nombre en todo el dataContext.
    const fakeBinding = `{{Event.DE.${fieldNameToFind}}}`;
    const replacementValue = extractDataBindingValue(fakeBinding, dataContext);

    // Si se encontró un valor de reemplazo, se usa. Si no, se deja el placeholder original.
    return replacementValue !== null ? replacementValue : match;
  });
}

module.exports = {
    extractDataBindingValue,
    getInArgValue,
    personalizeText
};