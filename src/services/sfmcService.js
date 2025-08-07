//Cliente HTTP para realizar llamadas a APIs externas
const axios = require("axios");
const log = require('../utils/logger');

/**
 * @module sfmcService
 * @description Este módulo centraliza toda la comunicación con la API de Salesforce Marketing Cloud.
 * Incluye la autenticación para obtener un token de acceso y la recuperación de datos
 * desde Data Extensions.
 */

// Caché para el token de la API de SFMC. Sigue el mismo patrón que el mockService.
let sfmcCachedToken = null;
let sfmcTokenExpiresAt = null;
let sfmcTokenPromise = null;

/**
 * Obtiene un token de acceso para la API de Marketing Cloud, utilizando las credenciales
 * del paquete instalado definidas en las variables de entorno.
 * Implementa un sistema de caché y manejo de concurrencia para ser eficiente.
 * 
 * @returns {Promise<string>} Una promesa que se resuelve con el token de acceso de SFMC.
 */
async function getSfmcAccessToken() {
  // Caso 1: Usar token de la caché si es válido, con un buffer de 60 segundos.
  if (sfmcCachedToken && Date.now() < (sfmcTokenExpiresAt - 60000)) {
    log("Usando token de SFMC válido desde la caché.");
    return sfmcCachedToken;
  }

  // Caso 2: Esperar a una petición de token que ya está en curso.
  if (sfmcTokenPromise) {
    log("Esperando a que otra petición complete la obtención del token de SFMC...");
    return sfmcTokenPromise;
  }

  // Caso 3: Pedir un nuevo token a la API de SFMC.
  log("Solicitando nuevo token de acceso para la API de SFMC...");
  
  sfmcTokenPromise = new Promise(async (resolve, reject) => {
    try {
      // Recuperación y validación de las variables de entorno necesarias para la autenticación.
      const { AUTH_URI, CLIENT_ID, CLIENT_SECRET, MID } = process.env;
      if (!AUTH_URI || !CLIENT_ID || !CLIENT_SECRET || !MID) {
        throw new Error("Las variables de entorno de la API de SFMC no están configuradas.");
      }

      // Construir el payload para la petición de autenticación OAuth 2.0 (Client Credentials Grant).
      const authPayload = {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        account_id: MID // El MID es crucial para obtener un token en el contexto del Business Unit correcto.
      };

      // Realizar la petición POST al endpoint de autenticación de SFMC.
      const response = await axios.post(AUTH_URI, authPayload, {
        headers: { 'Content-Type': 'application/json' }
      });

      // Validar la respuesta.
      if (!response.data || !response.data.access_token) {
        throw new Error("La respuesta de autenticación de SFMC es inválida.");
      }
      
      const accessToken = response.data.access_token;
      const expiresInSeconds = response.data.expires_in;

      // Actualizar la caché.
      sfmcCachedToken = accessToken;
      sfmcTokenExpiresAt = Date.now() + (expiresInSeconds * 1000);

      log("Nuevo token de SFMC obtenido y guardado en caché.");
      resolve(accessToken);

    } catch (error) {
      log("Error al obtener el token de SFMC.", { error: error.message });
      reject(error);
    } finally {
      // Limpiar la promesa pendiente para permitir futuras solicitudes.
      sfmcTokenPromise = null;
    }
  });

  return sfmcTokenPromise;
}

/**
 * Recupera todas las filas de la Data Extension "Templates_CK".
 * Utiliza el token de SFMC para autenticar la petición a la API REST.
 * 
 * @returns {Promise<Array<object>>} Una promesa que se resuelve con un array de objetos,
 * donde cada objeto representa una plantilla con id, name y message.
 */
async function getTemplatesFromDE() {
    log("Recibida petición para obtener templates de la DE.");
    
    // Asegurarse de tener un token válido.
    const accessToken = await getSfmcAccessToken();
    
    // Obtener la URI base de la API REST y la clave de la DE desde las variables de entorno.
    const restUri = process.env.REST_URI;
    const deCustomerKey = "Templates_CK"; // La clave externa de tu Data Extension.

    if (!restUri) {
        throw new Error("La variable de entorno REST_URI no está configurada.");
    }
    
    // Construir la URL completa para la petición a la API de Data Extensions.
    const requestUrl = `${restUri}/data/v1/customobjectdata/key/${deCustomerKey}/rowset`;

    log("Solicitando datos de la DE 'Templates' a la API de SFMC.");
    const deResponse = await axios.get(requestUrl, {
        headers: {
        'Authorization': `Bearer ${accessToken}`
        }
    });

    // Procesar la respuesta de la API para transformarla en un formato más simple y útil para el frontend.
    if (deResponse.data && deResponse.data.items) {
        const templates = deResponse.data.items.map(item => ({
            // El valor de la clave primaria viene en el objeto 'keys'.
            id: item.keys.templateid, 
            // Los valores del resto de campos vienen en el objeto 'values'.
            name: item.values.templatename,
            message: item.values.templatemessage
        }));
        log(`Se encontraron ${templates.length} templates.`, templates);
        return templates;
    } else {
        return []; // Devolver un array vacío si la DE no tiene filas o la respuesta es inesperada.
    }
}

module.exports = { getTemplatesFromDE };