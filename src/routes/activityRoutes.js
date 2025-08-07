// Trae el framework Express. Lo necesitamos para poder usar su funcionalidad de Router.
const express = require("express");

// Trae el módulo 'path' de Node.js para manejar rutas de archivos de forma segura.
const path = require("path");

// Importa nuestro propio middleware de seguridad desde su archivo.
// El '../' significa "sube un nivel de carpeta" (de /routes a /src).
const verifyJWT = require('../middlewares/verifyJWT');

// Importa DE FORMA SELECTIVA (usando { ... }) solo la función que necesitamos del servicio de SFMC.
const { getTemplatesFromDE } = require('../services/sfmcService');

// Importa solo la función para enviar el push desde el servicio del mock.
const { sendPush } = require('../services/mockService');

// Importa nuestro "set de herramientas" para manejar los datos del Journey.
const { 
    getInArgValue, 
    extractDataBindingValue, 
    personalizeText 
} = require('../utils/journeyUtils');

// Importa nuestra función de log estandarizada.
const log = require('../utils/logger');

const router = express.Router();

// --- Rutas del Ciclo de Vida y UI ---


// Endpoint para que el frontend obtenga los templates
router.get("/api/templates", async (req, res) => {
  try {
    const templates = await getTemplatesFromDE();
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener los templates." });
  }
});

router.post("/save", (req, res) => {
  log("Recibida petición de validación en /save");
  res.status(200).json({ success: true });
});

router.post("/validate", verifyJWT, (req, res) => {
  log("Recibida petición de validación en /validate");
  log("Payload decodificado para validación:", req.activityPayload);
  res.status(200).json({ success: true });
});

router.post("/publish", (req, res) => {
  log("Recibida petición de validación en /publish");
  res.status(200).json({ success: true });
});

router.post("/stop", (req, res) => {
  log("Recibida petición de validación en /stop");
  res.status(200).json({ success: true });
});

// --- Endpoint Principal de Ejecución ---

// Endpoint principal para ejecutar la actividad.
router.post("/execute", verifyJWT, async (req, res) => {
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
    let messageToSend = personalizeText(templateMessage, activityPayload) || message; // Fallback al campo 'message'

    log("Valores recuperados de la actividad:", {
          staticValues: { customText, selectedTemplate },
          resolvedValues: { deFieldValue, phone, message, templateMessage, messageToSend }
        });

    // Preparar el cuerpo de la petición para el servicio de push
    const pushPayload = {
      contactKey: activityPayload.keyValue, // El ContactKey del Journey
      dataFromActivity: {
        customText,
        selectedTemplate,
        deFieldValue,
        phone,
        message: messageToSend
      }
    };
    
    // Enviar datos al servicio mock de push
    const pushResponse = await sendPush(pushPayload);

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

module.exports = router;