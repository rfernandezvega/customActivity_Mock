const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
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

// Middleware basico
app.use((req, res, next) => {
  console.log(`Peticion recibida: ${req.method} ${req.url}`);
  
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Middleware simplificado sin validacion JWT
function verifyJWT(req, res, next) {
  // Version simplificada sin validacion JWT
  next();
}

// Endpoints requeridos por Marketing Cloud
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

app.listen(port, () => {
  log(`Servidor iniciado en puerto ${port} (Sin validacion JWT)`);
});