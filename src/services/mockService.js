//Cliente HTTP para realizar llamadas a APIs externas
const axios = require("axios");
const log = require('../utils/logger');

/**
 * @module mockService
 * @description Este módulo gestiona toda la comunicación con el servicio externo mock (Postman).
 * Incluye la obtención de tokens y el envío de datos de la actividad.
 */

/*
  Variables para la caché del token del servicio MOCK.
  Se declaran en un ámbito superior para que persistan entre peticiones concurrentes
  y a lo largo del tiempo de vida de la aplicación.
*/
// Almacena el token de acceso una vez obtenido.
let cachedToken = null;
// Almacena el timestamp (en milisegundos) de cuándo expira el token.
let tokenExpiresAt = null;
// Variable para manejar la promesa pendiente de obtener un token. Evita condiciones de carrera.
let tokenPromise = null; 

/**
 * Obtiene un token de acceso del servicio mock, implementando un sistema de caché y
 * un mecanismo para manejar peticiones concurrentes de forma eficiente.
 * 
 * Si un token válido existe en la caché, lo devuelve. Si una petición para obtener un
 * nuevo token ya está en curso, espera a que termine y devuelve su resultado. Si no,
 * inicia una nueva petición.
 * 
 * @returns {Promise<string>} Una promesa que se resuelve con el token de acceso.
 */
async function getMockServiceToken() {
  // Caso 1: Tenemos un token válido en caché. Devolverlo inmediatamente.
  // Se usa un buffer de seguridad de 60 segundos para evitar usar un token a punto de expirar.
  if (cachedToken && Date.now() < (tokenExpiresAt - 60000)) {
    log("Usando token válido desde la caché del servicio mock.");
    return cachedToken;
  }

  // Caso 2: Otra petición ya está buscando un token. Esperar a que esa promesa se resuelva.
  // Esto previene que múltiples peticiones concurrentes soliciten un token al mismo tiempo.
  if (tokenPromise) {
    log("Esperando a que otra petición complete la obtención del token del servicio mock...");
    return tokenPromise;
  }

  // Caso 3: Somos la primera petición que necesita un token nuevo.
  log("Token del servicio mock no encontrado o expirado. Solicitando uno nuevo...");
  
  // Creamos la promesa y la guardamos. Las siguientes peticiones concurrentes entrarán en el 'Caso 2'.
  tokenPromise = new Promise(async (resolve, reject) => {
    try {
      const tokenResponse = await axios.post('https://b9b67f2c-daf7-47aa-b8d7-8f42e290511a.mock.pstmn.io/token', {});
      
      // Validar que la respuesta de la API tiene la estructura esperada.
      if (!tokenResponse.data || !tokenResponse.data.access_token || !tokenResponse.data.expires_in) {
        throw new Error("Respuesta inválida del servicio de token mock.");
      }

      const accessToken = tokenResponse.data.access_token;
      const expiresInSeconds = tokenResponse.data.expires_in;
      
      // Actualizar las variables de la caché con los nuevos datos.
      cachedToken = accessToken;
      tokenExpiresAt = Date.now() + (expiresInSeconds * 1000); // Convertir segundos a milisegundos.

      log("Nuevo token del servicio mock obtenido y guardado en caché.", { expiresAt: new Date(tokenExpiresAt).toISOString() });
      
      // La promesa se resuelve exitosamente con el nuevo token.
      resolve(accessToken);

    } catch (error) {
      log("Error al obtener un nuevo token de acceso del servicio mock.", { error: error.message });
      // La promesa se rechaza con el error para que las funciones que esperan puedan manejarlo.
      reject(error);
    } finally {
      // Importante: Limpiar la promesa pendiente.
      // Esto asegura que la próxima vez que el token expire, una nueva petición pueda volver a entrar en el 'Caso 3'.
      tokenPromise = null;
    }
  });

  return tokenPromise;
}

/**
 * Envía el payload final de la actividad al endpoint /push del servicio mock.
 * Primero, se asegura de tener un token de acceso válido llamando a getMockServiceToken().
 * 
 * @param {object} pushPayload - El cuerpo de la petición (payload) que se enviará al servicio.
 * @returns {Promise<object>} Una promesa que se resuelve con la respuesta de la API de push.
 */
async function sendPush(pushPayload) {
    // Obtener un token válido (ya sea de la caché o uno nuevo).
    const accessToken = await getMockServiceToken();

    log("Enviando datos al servicio push", { payload: pushPayload });
    
    // Realizar la petición POST al endpoint /push, incluyendo el token en la cabecera de autorización.
    const pushResponse = await axios.post(
      'https://b9b67f2c-daf7-47aa-b8d7-8f42e290511a.mock.pstmn.io/push',
      pushPayload,
      {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    // Devolver la respuesta completa de Axios.
    return pushResponse;
}

module.exports = { sendPush };