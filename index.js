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

// Endpoint principal para ejecutar la actividad. Se puede eliminar verifyJWT para pruebas. app.post("/execute", verifyJWT, async (req, res)
app.post("/execute", verifyJWT, async (req, res) => {
  log("Procesando petición push");
  
  try {
    // Obtener inArguments
    const activityPayload = req.activityPayload;
    const inArgs = activityPayload.inArguments || [];
                      
    // Obtener valores y bindings de la configuración
    const customText = getInArgValue(inArgs, 'customText'); // Valor estático
    const selectedTemplate = getInArgValue(inArgs, 'selectedTemplate'); // Valor estático
    const deFieldBinding = getInArgValue(inArgs, 'selectedDEField'); // Data Binding
    const phoneBinding = getInArgValue(inArgs, 'phone'); // Data Binding
    const messageBinding = getInArgValue(inArgs, 'message'); // Data Binding
    
    // Extraer valores de los data bindings
    const deFieldValue = extractDataBindingValue(deFieldBinding, activityPayload);
    const phone = extractDataBindingValue(phoneBinding, activityPayload);
    const message = extractDataBindingValue(messageBinding, activityPayload);

    log("Valores recuperados de la actividad:", {
          contactKey: req.body.keyValue,
          staticValues: { customText, selectedTemplate },
          resolvedValues: { deFieldValue, phone, message }
        });

    // -- Paso 1: Obtener el token de autenticación del servicio mock --
    let accessToken;
    // Comprobar si tenemos un token en caché Y si no ha expirado
    // Se añade un buffer de seguridad de 60 segundos.
    if (cachedToken && Date.now() < (tokenExpiresAt - 60000)) {
      log("Usando token válido desde la caché.");
      accessToken = cachedToken;
    } else {
      // Si no hay token o ha expirado (o está a punto de), pedimos uno nuevo
      log("Token no encontrado en caché o expirado. Solicitando uno nuevo...");

      try {
        log("Solicitando token de acceso al servicio mock...");
        const tokenResponse = await axios.post('https://b9b67f2c-daf7-47aa-b8d7-8f42e290511a.mock.pstmn.io/token', {});
        
        if (!tokenResponse.data || !tokenResponse.data.access_token || !tokenResponse.data.expires_in) {
          throw new Error("La respuesta del servicio de token es inválida o no contiene un 'access_token' y 'expires_in'.");
        }

         // Guardar el nuevo token y calcular su fecha de expiración
        accessToken = tokenResponse.data.access_token;
        const expiresInSeconds = tokenResponse.data.expires_in;
        
        cachedToken = accessToken;
        tokenExpiresAt = Date.now() + (expiresInSeconds * 1000); // Convertir segundos a milisegundos
      
        log("Nuevo token obtenido y guardado en caché.", { expiresAt: new Date(tokenExpiresAt).toISOString() });
      } catch (tokenError) {
        log("Error al obtener el token de acceso", { 
          error: tokenError.message, 
          status: tokenError.response?.status,
          data: tokenError.response?.data
        });
        // Devolver error a Marketing Cloud
        return res.status(500).json({ 
          status: "error", 
          message: "Fallo al obtener el token de autenticación del servicio externo."
        });
      }
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