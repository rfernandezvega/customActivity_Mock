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

//Activa el parseador (Middleware nativo de Express que transforma el cuerpo de la petición a JSON automáticamente) 
app.use(express.json());
//Indica a express que sirva todos los archivos estáticos (archivos que no se procesan en el servidor, solo se envían tal como están) de la carpeta public
app.use(express.static(path.join(__dirname, "public")));


// Middleware para validacion JWT
function verifyJWT(req, res, next) 
{
  // En Custom Activities, MC envía el JWT en el body, no en el header.
  if (!req.body || !req.body.token) {
      log("Error de autenticación: No se encontró token JWT en el cuerpo de la petición.");
      return res.status(401).json({ error: "Token JWT no encontrado en el body" });
  }
  const token = req.body.token;

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
    La "Audience" es un claim (una pieza de información) dentro del token que especifica para quién o para qué servicio está destinado ese token.
    ¿Quién lo establece? 
      Cuando se configura "useJwt": true en config.json, Marketing Cloud no solo firma el token, sino que también lo emiten con una audiencia específica. 
      Para las Custom Activities, esa audiencia es 'custom-activity'.
    ¿Cómo funciona la verificación? 
      Al añadir el objeto de opciones { audience: 'custom-activity' } a jwt.verify(), le estás diciendo a la librería jsonwebtoken:
      "No solo verifiques que la firma y la fecha de expiración sean correctas. 
      También es OBLIGATORIO que compruebes que el token tiene un claim de audiencia (aud) y que su valor sea exactamente 'custom-activity'. 
      Si no es así, considera que la verificación ha fallado."
  */
  jwt.verify(token, JWT_SECRET, { audience: 'custom-activity' }, (err, decoded) => {
    if (err) {
      log("Error de autenticación: Token inválido o expirado.", { error: err.message });
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    /* 
      Si el token es válido, la función te entrega un objeto llamado decoded, que contiene los datos del token. Por ejemplo:
      - sub: Identifica al sujeto del token, normalmente el ID del usuario.
      - iat: Fecha/hora de emisión en formato timestamp (segundos desde 1970).
      - exp: Fecha/hora de expiración en formato timestamp.

      Guardar estos datos en req.user (propiedad personalizada) permite que otros middlewares o controladores accedan 
      a la información del usuario sin tener que verificar el token nuevamente. OPCIONAL
    */
    req.user = decoded;

    next();
  });
}


/* Endpoints requeridos por Marketing Cloud */

//Cuando se arrastra la actividad al Journey, MC busca la ruta /config.json, que es obligatoria. En este caso se devuelve el archivo.
app.get("/config.json", (req, res) => {
  res.sendFile(path.join(__dirname, "config.json"));
});

app.post("/save", (req, res) => {
  res.status(200).json({ success: true });
});

app.post("/validate", (req, res) => {
  res.status(200).json({ success: true });
});

app.post("/publish", (req, res) => {
  res.status(200).json({ success: true });
});

app.post("/stop", (req, res) => {
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

// Endpoint principal para ejecutar la actividad. Se puede eliminar verifyJWT para pruebas.
app.post("/execute", verifyJWT, async (req, res) => {
  log("Procesando petición push");
  
  try {
    // Obtener inArguments
    const inArgs = req.body.inArguments || 
                  (req.body.arguments?.execute?.inArguments) || 
                  [];
                      
    // Obtener valores y bindings de la configuración
    const customText = getInArgValue(inArgs, 'customText'); // Valor estático
    const selectedTemplate = getInArgValue(inArgs, 'selectedTemplate'); // Valor estático
    const deFieldBinding = getInArgValue(inArgs, 'selectedDEField'); // Data Binding
    const phoneBinding = getInArgValue(inArgs, 'phone'); // Data Binding
    const messageBinding = getInArgValue(inArgs, 'message'); // Data Binding
    
    // Extraer valores de los data bindings
    const deFieldValue = extractDataBindingValue(deFieldBinding, req.body);
    const phone = extractDataBindingValue(phoneBinding, req.body);
    const message = extractDataBindingValue(messageBinding, req.body);

    log("Valores recuperados de la actividad:", {
          contactKey: req.body.keyValue,
          staticValues: { customText, selectedTemplate },
          resolvedValues: { deFieldValue, phone, message }
        });

    // -- Paso 1: Obtener el token de autenticación del servicio mock --
    let accessToken;
    try {
      log("Solicitando token de acceso al servicio mock...");
      const tokenResponse = await axios.post('https://b9b67f2c-daf7-47aa-b8d7-8f42e290511a.mock.pstmn.io/token', {});
      
      if (!tokenResponse.data || !tokenResponse.data.access_token) {
        throw new Error("La respuesta del servicio de token es inválida o no contiene un 'access_token'.");
      }

      accessToken = tokenResponse.data.access_token;
     
      log("Token de acceso obtenido con éxito.");

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

    // -- Paso 2: Enviar los datos al servicio de push con el token --
    
    // Preparar el cuerpo de la petición para el servicio de push
    const pushPayload = {
      contactKey: req.body.keyValue, // El ContactKey del Journey
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
  log(`Servidor iniciado en puerto ${port} (Sin validacion JWT)`);
});