//Cliente HTTP para realizar llamadas a APIs externas
const axios = require("axios");
const log = require('../utils/logger');

// Caché para el token de la API de SFMC
let sfmcCachedToken = null;
let sfmcTokenExpiresAt = null;
let sfmcTokenPromise = null;

async function getSfmcAccessToken() {
  // Caso 1: Usar token de la caché si es válido.
  if (sfmcCachedToken && Date.now() < (sfmcTokenExpiresAt - 60000)) {
    log("Usando token de SFMC válido desde la caché.");
    return sfmcCachedToken;
  }

  // Caso 2: Esperar a una petición de token que ya está en curso.
  if (sfmcTokenPromise) {
    log("Esperando a que otra petición complete la obtención del token de SFMC...");
    return sfmcTokenPromise;
  }

  // Caso 3: Pedir un nuevo token.
  log("Solicitando nuevo token de acceso para la API de SFMC...");
  
  sfmcTokenPromise = new Promise(async (resolve, reject) => {
    try {

      // Recuperacion de las variables de entorno
      const { AUTH_URI, CLIENT_ID, CLIENT_SECRET, MID } = process.env;

      if (!AUTH_URI || !CLIENT_ID || !CLIENT_SECRET || !MID) {
        throw new Error("Las variables de entorno de la API de SFMC no están configuradas.");
      }

      const authPayload = {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        account_id: MID
      };

      const response = await axios.post(AUTH_URI, authPayload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.data || !response.data.access_token) {
        throw new Error("La respuesta de autenticación de SFMC es inválida.");
      }
      
      const accessToken = response.data.access_token;
      const expiresInSeconds = response.data.expires_in;

      sfmcCachedToken = accessToken;
      sfmcTokenExpiresAt = Date.now() + (expiresInSeconds * 1000);

      log("Nuevo token de SFMC obtenido y guardado en caché.");
      resolve(accessToken);

    } catch (error) {
      log("Error al obtener el token de SFMC.", { error: error.message });
      reject(error);
    } finally {
      sfmcTokenPromise = null;
    }
  });

  return sfmcTokenPromise;
}

async function getTemplatesFromDE() {
    log("Recibida petición para obtener templates de la DE.");
    const accessToken = await getSfmcAccessToken();
    const restUri = process.env.REST_URI;
    const deCustomerKey = "Templates_CK"; // La clave externa de tu Data Extension

    if (!restUri) {
        throw new Error("La variable de entorno REST_URI no está configurada.");
    }
    
    // Construir la URL para obtener las filas de la DE
    const requestUrl = `${restUri}/data/v1/customobjectdata/key/${deCustomerKey}/rowset`;

    log("Solicitando datos de la DE 'Templates' a la API de SFMC.");
    const deResponse = await axios.get(requestUrl, {
        headers: {
        'Authorization': `Bearer ${accessToken}`
        }
    });

    // Procesar la respuesta para que sea fácil de usar en el frontend
    if (deResponse.data && deResponse.data.items) {
        const templates = deResponse.data.items.map(item => ({
        id: item.keys.templateid, 
        name: item.values.templatename,
        message: item.values.templatemessage
        }));
        log(`Se encontraron ${templates.length} templates.`, templates);
        return templates;
    } else {
        return []; // Devolver un array vacío si no hay items
    }
}

module.exports = { getTemplatesFromDE };