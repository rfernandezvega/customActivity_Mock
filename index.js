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
  const JWT_SECRET = process.env.JWT_SECRET;

  // El token puede venir en el header Authorization como 'Bearer <token>'
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No se proporcionó token de autorización" });
  }

  // Separar 'Bearer' y el token
  const token = authHeader.split(" ")[1]; 

  if (!token) {
    return res.status(401).json({ error: "Token JWT no encontrado" });
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

// Endpoint principal para ejecutar la actividad
app.post("/execute", verifyJWT, async (req, res) => {
  log("Procesando peticion SMS");
  
  try {
    // Obtener inArguments
    const inArgs = req.body.inArguments || 
                  (req.body.arguments?.execute?.inArguments) || 
                  [];
    
    // Obtener los data bindings configurados
    const phoneBinding = getInArgValue(inArgs, 'phone');
    const messageBinding = getInArgValue(inArgs, 'message');
    const fromBinding = getInArgValue(inArgs, 'from');
    
    // Extraer valores de los data bindings
    let phone = extractDataBindingValue(phoneBinding, req.body);
    let message = extractDataBindingValue(messageBinding, req.body);
    let from = extractDataBindingValue(fromBinding, req.body) || "";
    
    // Verificar datos obligatorios
    if (!phone) {
      log("Error: No se pudo obtener el numero de telefono");
      return res.status(400).json({ 
        error: "No se pudo obtener el numero de telefono de la Data Extension.",
        details: "El campo de telefono no existe o esta vacio en los datos del Journey."
      });
    }
    
    if (!message) {
      log("Error: No se pudo obtener el mensaje");
      return res.status(400).json({ 
        error: "No se pudo obtener el mensaje de la Data Extension.",
        details: "El campo de mensaje no existe o esta vacio en los datos del Journey."
      });
    }
    
    // Credenciales de Lleida.net
    const user = process.env.USER_LLEIDA;
    const apiKey = process.env.PASS_LLEIDA;

    if (!user) {
      log("Error: USER_LLEIDA no definido");
      return res.status(500).json({ error: "Credencial USER_LLEIDA no configurada" });
    }
    
    if (!apiKey) {
      log("Error: PASS_LLEIDA no definido");
      return res.status(500).json({ error: "Credencial PASS_LLEIDA no configurada" });
    }
    
    // Verificar numero de telefono (formato internacional)
    if (!phone.startsWith('+')) {
      log("Error: Numero de telefono sin formato internacional", { phone });
      return res.status(400).json({ error: "El numero de telefono debe tener formato internacional (comenzar con +)" });
    }
    
    // Enviar SMS a Lleida.net
    const apiUrl = "https://api.lleida.net/sms/v2/";
    
    // Preparar el cuerpo de la peticion
    const requestBody = {
      sms: {
        user: user,
        dst: { num: phone },
        txt: message
      }
    };
    
    // Agregar remitente si se especifico
    if (from && from.trim() !== '') {
      requestBody.sms.src = from;
    }
    
    try {
      // Envio a Lleida.net con autenticacion mediante API Key en el header
      const response = await axios.post(apiUrl, requestBody, {
        headers: { 
          "Content-Type": "application/json; charset=utf-8",
          "Accept": "application/json",
          "Authorization": `x-api-key ${apiKey}`
        }
      });

      log("SMS enviado con exito", { 
        phone: phone,
        messageLength: message.length, 
        status: response.status
      });
      
      // Devolver respuesta a Marketing Cloud
      res.status(200).json({ 
        status: "ok", 
        result: response.data,
        details: {
          to: phone,
          message: message,
          from: from || "default",
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      log("Error al enviar SMS", { 
        error: error.message, 
        status: error.response?.status 
      });
      
      // Devolver error a Marketing Cloud
      res.status(error.response?.status || 500).json({ 
        status: "error", 
        details: {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        }
      });
    }
  } catch (error) {
    log("Error general en procesamiento", { error: error.message });
    res.status(500).json({ 
      status: "error", 
      message: "Error interno al procesar la solicitud",
      details: {
        error: error.message
      }
    });
  }
});


// Se encarga de que el servidor Express empiece a "escuchar" solicitudes HTTP en el puerto definido por port
app.listen(port, () => {
  log(`Servidor iniciado en puerto ${port} (Sin validacion JWT)`);
});