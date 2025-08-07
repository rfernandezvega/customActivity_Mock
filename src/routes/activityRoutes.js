const express = require("express");
const path = require("path");
const verifyJWT = require('../middlewares/verifyJWT');
const { getTemplatesFromDE } = require('../services/sfmcService');
const { sendPush } = require('../services/mockService');
const { 
    getInArgValue, 
    extractDataBindingValue, 
    personalizeText 
} = require('../utils/journeyUtils');
const log = require('../utils/logger');

const router = express.Router();

// --- Rutas del Ciclo de Vida y UI ---

//Cuando se arrastra la actividad al Journey, MC busca la ruta /config.json, que es obligatoria.
router.get("/config.json", (req, res) => {
  log("Recibida petición de solicitud de config.json");
  // __dirname aquí apunta a /src/routes, por lo que necesitamos subir dos niveles para llegar a la raíz.
  res.sendFile(path.join(__dirname, "../../", "config.json"));
});

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