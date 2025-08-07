//Framework para Node.js
const express = require("express");
//Cliente HTTP para realizar llamadas a APIs externas
const axios = require("axios");
//Modulo nativo de Node.js para manejar rutas de archivos
const path = require("path");
//Importa la libreria para poder validar el token JWT con el secret
const jwt = require("jsonwebtoken");

const app = express();

/*
  Process: objeto global incorporado en Node.js
  Es un objeto que representa el proceso en ejecución de Node.js.
  Da acceso a información del entorno, argumentos del sistema, eventos, etc
*/
const port = process.env.PORT || 3000;

/*
  Variables para la caché del token
  Se declaran en un ámbito superior para que persistan entre peticiones.
*/
let cachedToken = null;
// Almacenará el timestamp de expiración en milisegundos
let tokenExpiresAt = null;
// Variable para manejar la promesa pendiente de obtener un token.
let tokenPromise = null; 

// Caché para el token de la API de SFMC
/*
  Variables para la caché del token de la API de Marketing Cloud.
  Es independiente del token del servicio mock.
*/
let sfmcCachedToken = null;
let sfmcTokenExpiresAt = null;
let sfmcTokenPromise = null;

// Funcion para logs de produccion - minimos pero informativos
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}:`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Middleware basico que se aplica a todas las peticiones que se reciben 
app.use((req, res, next) => {
  console.log(`Peticion recibida: ${req.method} ${req.url}`);
  
  /* Se agregan cabeceras a la respuesta. */ 

  // Permite que la app se pueda mostrar dentro de un iframe en cualquier sitio web. Obligatorio
  res.setHeader("X-Frame-Options", "ALLOWALL");
  // Permite CORS: habilita que el servidor acepte peticiones desde cualquier dominio.
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Indica qué métodos HTTP están permitidos (CORS).
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // Especifica qué headers están permitidos en la solicitud
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  /* 
    El metodo OPTIONS es para las peticiones CORS preflight request. 
    Peticiones previas a las reales que realiza el navegador para asegurarse que el servidor permite recibir peticiones desde otro dominio 
  */
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Llama al siguiente middleware de express (indicado con app.use con los parámetros req, res y next)
  // Sí no hay una respuesta o next, se quedará colgado.
  next();
});

/*
  Activa el parseador (Middleware nativo de Express que transforma el cuerpo de la petición a JSON automáticamente)
  Importante. 
  Si no se usa jwt, esto está configurado para entender peticiones con Content-Type: application/json. Cuando ve llegar 
  una petición con Content-Type: application/jwt, no sabe cómo procesarla. Como resultado, no puebla el objeto req.body
 */
app.use(express.json());
// Necesario si se usa JWT para poder parsear la petición
app.use(express.text({ type: 'application/jwt' }));
//Indica a express que sirva todos los archivos estáticos (archivos que no se procesan en el servidor, solo se envían tal como están) de la carpeta public
app.use(express.static(path.join(__dirname, "public")));


// Middleware para validacion JWT
function verifyJWT(req, res, next) 
{
  log("--- Validación JWT ---");
  log("Cabeceras de la petición:", req.headers);
  log("Cuerpo completo de la petición:", req.body);

   let token;
  // Comprobar si el body es una cadena (el caso de application/jwt)
  if (typeof req.body === 'string' && req.body.length > 0) {
    token = req.body;
  } else if (req.body && req.body.token) {
    // Fallback por si en otros endpoints (como /save) viniera como JSON
    token = req.body.token;
  }

  if (!token) {
    log("Error de autenticación: No se encontró token en un formato válido.");
    return res.status(401).json({ error: "Token JWT no encontrado" });
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
      log("Error de configuración del servidor: JWT_SECRET no definido.");
      return res.status(500).json({ error: "Secreto de JWT no configurado en el servidor." });
  }

  /* 
    Validación del token
    La función intenta verificar que el token:
      - Está bien formado (estructura JWT correcta).
      - No ha sido modificado (la firma coincide con el secreto).
      - No está expirado (si tiene un exp).  
  */
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      log("Error de autenticación: Token inválido o expirado.", { error: err.message });
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    /* 
      Si el token es válido, la función te entrega un objeto llamado decoded, que contiene los datos del token. Por ejemplo:
      - sub: Identifica al sujeto del token, normalmente el ID del usuario.
      - iat: Fecha/hora de emisión en formato timestamp (segundos desde 1970).
      - exp: Fecha/hora de expiración en formato timestamp.

      Guardar estos datos en req.activityPayload (propiedad personalizada) permite que otros middlewares o controladores accedan 
      a la información del usuario sin tener que verificar el token nuevamente.
    */
    req.activityPayload = decoded;

    log("Verificación JWT exitosa. Payload decodificado del token:", req.activityPayload);

    next();
  });
}


/* Endpoints requeridos por Marketing Cloud */

//Cuando se arrastra la actividad al Journey, MC busca la ruta /config.json, que es obligatoria. En este caso se devuelve el archivo.
app.get("/config.json", (req, res) => {
  log("Recibida petición de solicitud de config.json");
  res.sendFile(path.join(__dirname, "config.json"));
});

app.get("/api/templates", async (req, res) => {
  log("Recibida petición para obtener templates de la DE.");
  try {
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
      res.status(200).json(templates);
    } else {
      res.status(200).json([]); // Devolver un array vacío si no hay items
    }
  } catch (error) {
    log("Error en el endpoint /api/templates.", { error: error.message });
    res.status(500).json({ error: "No se pudieron obtener los templates." });
  }
});

app.post("/save", (req, res) => {
  log("Recibida petición de validación en /save");
  res.status(200).json({ success: true });
});

app.post("/validate", verifyJWT, (req, res) => {
  log("Recibida petición de validación en /validate");

  log("Payload decodificado para validación:", req.activityPayload);

  res.status(200).json({ success: true });
});

app.post("/publish", (req, res) => {
  log("Recibida petición de validación en /publish");
  res.status(200).json({ success: true });
});

app.post("/stop", (req, res) => {
  log("Recibida petición de validación en /stop");
  res.status(200).json({ success: true });
});

async function getAccessToken() {
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
      const AUTH_URI = process.env.AUTH_URI;
      const CLIENT_ID = process.env.CLIENT_ID;
      const CLIENT_SECRET = process.env.CLIENT_SECRET;
      const MID = process.env.MID;

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

// Funcion para extraer el valor de un data binding
function extractDataBindingValue(binding, data) {
  if (!binding || typeof binding !== 'string' || binding.trim() === '') {
    return null;
  }
  
  // Si es una referencia de data binding con formato {{Event.key.field}}
  if (binding.startsWith('{{') && binding.endsWith('}}')) {
    const path = binding.slice(2, -2); // Quitar {{ y }}
    const parts = path.split('.');
    
    // El binding debe comenzar con "Event."
    if (parts.length >= 2 && parts[0] === 'Event') {
      // El valor deberia estar en data.Event
      if (data.Event) {
        try {
          // Construir la ruta exacta para acceder al valor
          let currentObj = data.Event;
          
          // Navegar a traves de la estructura empezando despues de 'Event'
          for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            
            if (currentObj && currentObj[part] !== undefined) {
              currentObj = currentObj[part];
            } else {
              return null;
            }
          }
          
          return currentObj;
        } catch (error) {
          log(`Error al extraer valor de binding: ${error.message}`);
        }
      } else {
        // Intentar buscar por el ultimo componente (nombre del campo)
        const fieldName = parts[parts.length - 1];
        
        // Buscar recursivamente en el objeto data
        const searchInObject = (obj, field) => {
          if (!obj || typeof obj !== 'object') return null;
          
          // Verificar propiedad directa
          if (obj[field] !== undefined) {
            return obj[field];
          }
          
          // Buscar en subpropiedades
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
    // Si no es un binding pero tiene valor, devolverlo tal cual
    return binding;
  }
  
  return null;
}

// Funcion para acceder a datos de inArguments
function getInArgValue(inArgs, fieldName) {
  if (!inArgs || !Array.isArray(inArgs) || inArgs.length === 0) {
    return null;
  }
  
  // Buscar el campo en el primer objeto de inArguments
  const arg = inArgs[0];
  return arg[fieldName];
}

// Función para personalizar mensajes 
/**
 * Busca y reemplaza placeholders del tipo %%FieldName%% en un texto.
 * @param {string} text - El texto de la plantilla (ej: "Hola %%FirstName%%").
 * @param {object} dataContext - El objeto de datos del contacto (activityPayload).
 * @returns {string} - El texto con los placeholders reemplazados.
 */
function personalizeText(text, dataContext) {
  log("Personalizando mensaje");
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Expresión regular para encontrar todos los placeholders del tipo %%...%%
  return text.replace(/%%(.*?)%%/g, (match, fieldName) => {
    // Para cada placeholder encontrado, extraemos el nombre del campo.
    const fieldNameToFind = fieldName.trim();
    
    // Usamos nuestra función 'extractDataBindingValue' de una forma un poco diferente.
    // Creamos un "binding falso" para que la función busque el valor.
    const fakeBinding = `{{Event.DE.${fieldNameToFind}}}`; // La estructura interna no importa, solo el final.
    const replacementValue = extractDataBindingValue(fakeBinding, dataContext);

    // Si encontramos un valor, lo devolvemos. Si no, devolvemos el placeholder original.
    return replacementValue !== null ? replacementValue : match;
  });
}

// Endpoint principal para ejecutar la actividad. Se puede eliminar verifyJWT para pruebas. app.post("/execute", verifyJWT, async (req, res)
app.post("/execute", verifyJWT, async (req, res) => {
  log("Procesando petición execute");
  
  try {
    // Obtener inArguments
    const activityPayload = req.activityPayload;
    const inArgs = activityPayload.inArguments || [];
                      
    // Obtener valores y bindings de la configuración
    const customText = getInArgValue(inArgs, 'customText'); // Valor estático
    const selectedTemplate = getInArgValue(inArgs, 'selectedTemplate'); // Valor estático
    const templateMessage = getInArgValue(inArgs, 'selectedTemplateMessage'); // El mensaje SIN personalizar
    const deFieldBinding = getInArgValue(inArgs, 'selectedDEField'); // Data Binding
    const phoneBinding = getInArgValue(inArgs, 'phone'); // Data Binding
    const messageBinding = getInArgValue(inArgs, 'message'); // Data Binding
    
    // Extraer valores de los data bindings
    const deFieldValue = extractDataBindingValue(deFieldBinding, activityPayload);
    const phone = extractDataBindingValue(phoneBinding, activityPayload);
    const message = extractDataBindingValue(messageBinding, activityPayload);

    // Mensaje personalizado.
    let messageToSend = personalizeText(templateMessage, activityPayload) || templateMessage;

    log("Valores recuperados de la actividad:", {
          staticValues: { customText, selectedTemplate },
          resolvedValues: { deFieldValue, phone, message, messageToSend }
        });

    // -- Paso 1: Obtener el token de autenticación del servicio mock --
    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      // Si la obtención del token falla, devolver error.
      return res.status(500).json({ 
        status: "error", 
        message: "Fallo al obtener el token de autenticación del servicio externo."
      });
    }

    // -- Paso 2: Enviar los datos al servicio de push con el token --
    
    // Preparar el cuerpo de la petición para el servicio de push
    const pushPayload = {
      contactKey: activityPayload.keyValue, // El ContactKey del Journey
      dataFromActivity: {
        customText,
        selectedTemplate,
        deFieldValue,
        phone,
        message
      }
    };
    
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

    if (pushResponse.status >= 200 && pushResponse.status < 300) {
      log("Llamada al servicio push realizada con éxito", { 
        status: pushResponse.status,
        response: pushResponse.data 
      });
      
      // Devolver respuesta OK a Marketing Cloud
      return res.status(200).json({ 
        status: "ok", 
        result: pushResponse.data
      });
    } else {
      // Este bloque es por si axios se configurara para no lanzar error en códigos 4xx/5xx
      throw new Error(`El servicio push respondió con un estado inesperado: ${pushResponse.status}`);
    }
  } catch (pushError) {
    log("Error al enviar la petición al servicio push", { 
        error: pushError.message, 
        status: pushError.response?.status,
        data: pushError.response?.data
      });
      
      // Devolver error a Marketing Cloud
      return res.status(500).json({ 
        status: "error", 
        message: "Fallo al enviar los datos al servicio de push.",
        details: {
          errorMessage: pushError.message,
          statusCode: pushError.response?.status
        }
      });
    }
});


// Se encarga de que el servidor Express empiece a "escuchar" solicitudes HTTP en el puerto definido por port
app.listen(port, () => {
  log(`Servidor iniciado en puerto ${port}`);
});