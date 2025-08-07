//Cliente HTTP para realizar llamadas a APIs externas
const axios = require("axios");
const log = require('../utils/logger');

/*
  Variables para la caché del token
  Se declaran en un ámbito superior para que persistan entre peticiones.
*/
let cachedToken = null;
// Almacenará el timestamp de expiración en milisegundos
let tokenExpiresAt = null;
// Variable para manejar la promesa pendiente de obtener un token.
let tokenPromise = null; 

async function getMockServiceToken() {
  // Caso 1: Tenemos un token válido en caché. Devolverlo inmediatamente.
  if (cachedToken && Date.now() < (tokenExpiresAt - 60000)) {
    log("Usando token válido desde la caché.");
    return cachedToken;
  }

  // Caso 2: Otra petición ya está buscando un token. Esperar a que esa promesa se resuelva.
  if (tokenPromise) {
    log("Esperando a que otra petición complete la obtención del token...");
    return tokenPromise;
  }

  // Caso 3: Somos la primera petición que necesita un token nuevo.
  log("Token no encontrado o expirado. Solicitando uno nuevo...");
  
  // Creamos la promesa y la guardamos. Las siguientes peticiones entrarán en el 'Caso 2'.
  tokenPromise = new Promise(async (resolve, reject) => {
    try {
      const tokenResponse = await axios.post('https://b9b67f2c-daf7-47aa-b8d7-8f42e290511a.mock.pstmn.io/token', {});
      
      if (!tokenResponse.data || !tokenResponse.data.access_token || !tokenResponse.data.expires_in) {
        throw new Error("Respuesta inválida del servicio de token.");
      }

      const accessToken = tokenResponse.data.access_token;
      const expiresInSeconds = tokenResponse.data.expires_in;
      
      // Actualizar la caché
      cachedToken = accessToken;
      tokenExpiresAt = Date.now() + (expiresInSeconds * 1000);

      log("Nuevo token obtenido y guardado en caché.", { expiresAt: new Date(tokenExpiresAt).toISOString() });
      
      // La promesa se resuelve con el nuevo token
      resolve(accessToken);

    } catch (error) {
      log("Error al obtener un nuevo token de acceso.", { error: error.message });
      // La promesa se rechaza con el error
      reject(error);
    } finally {
      // Importante: Limpiar la promesa pendiente para que la siguiente vez que expire el token, se pueda pedir uno nuevo.
      tokenPromise = null;
    }
  });

  return tokenPromise;
}

async function sendPush(pushPayload) {
    const accessToken = await getMockServiceToken();

    log("Enviando datos al servicio push", { payload: pushPayload });
    
    // Enviar datos al servicio mock de push
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

    return pushResponse;
}

module.exports = { sendPush };