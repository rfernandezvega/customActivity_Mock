/**
 * @file activityRoutes.js
 * @description Define todas las rutas (endpoints) de la API para la Custom Activity.
 * Este archivo actúa como el controlador principal, recibiendo las peticiones HTTP
 * y orquestando las llamadas a los servicios y funciones de utilidad correspondientes.
 */

// Trae el framework Express. Lo necesitamos para poder usar su funcionalidad de Router.
const express = require("express");

// Importa nuestro propio middleware de seguridad desde su archivo.
// El '../' significa "sube un nivel de carpeta" (de /routes a /src).
const verifyJWT = require('../middlewares/verifyJWT');

// Importa DE FORMA SELECTIVA (usando { ... }) solo las funciones que necesitamos de nuestros archivos de servicios.
const { getTemplatesFromDE } = require('../services/sfmcService');
const { sendPush } = require('../services/mockService');

// Importa nuestro "set de herramientas" para manejar los datos del Journey.
const  getInArgValue  = require('../utils/journeyUtils');

// Importa nuestra función de log estandarizada.
const log = require('../utils/logger');

/**
 * @constant router
 * @description Una instancia de express.Router().
 * El Router de Express nos permite agrupar un conjunto de rutas relacionadas en un
 * módulo separado. Esto mantiene nuestro archivo principal (index.js) limpio y se
 * enfoca solo en la configuración del servidor, mientras que este archivo se enfoca
 * en la lógica de las rutas de la actividad.
 * Funciona como una "mini-aplicación" que luego se "monta" en la aplicación principal.
 */
const router = express.Router();

// --- Rutas del Ciclo de Vida y UI ---

/**
 * @route GET /api/templates
 * @description Endpoint para la interfaz de usuario (config.html).
 * Se encarga de llamar al servicio de SFMC para obtener la lista de templates
 * desde la Data Extension y devolverla en formato JSON para poblar el desplegable.
 */
router.get("/api/templates", async (req, res) => {
  try {
    const templates = await getTemplatesFromDE();
    res.status(200).json(templates);
  } catch (error) {
    // Si la obtención de templates falla, se devuelve un error 500.
    res.status(500).json({ error: "No se pudieron obtener los templates." });
  }
});

/**
 * @route POST /save
 * @description Endpoint del ciclo de vida de Journey Builder.
 * Se llama cuando el usuario hace clic en "Hecho" en la UI.
 * En esta implementación, simplemente confirma la recepción.
 */
router.post("/save", (req, res) => {
  log("Recibida petición en /save");
  res.status(200).json({ success: true });
});

/**
 * @route POST /validate
 * @description Endpoint del ciclo de vida de Journey Builder.
 * Se llama cuando el usuario intenta validar o activar el Journey.
 * Está protegido por JWT. Si la petición llega hasta aquí, significa que es auténtica.
 * Sirve como un "ping" de validación para Journey Builder.
 */
router.post("/validate", verifyJWT, (req, res) => {
  log("Recibida petición de validación en /validate");
  log("Payload decodificado para validación:", req.activityPayload);
  res.status(200).json({ success: true });
});

/**
 * @route POST /publish
 * @description Endpoint del ciclo de vida de Journey Builder.
 * Se llama cuando el Journey se activa.
 */
router.post("/publish", (req, res) => {
  log("Recibida petición en /publish");
  res.status(200).json({ success: true });
});

/**
 * @route POST /stop
 * @description Endpoint del ciclo de vida de Journey Builder.
 * Se llama cuando el Journey se detiene.
 */
router.post("/stop", (req, res) => {
  log("Recibida petición en /stop");
  res.status(200).json({ success: true });
});


// --- Endpoint Principal de Ejecución ---

/**
 * @route POST /execute
 * @description El endpoint principal de la actividad.
 * Journey Builder llama a esta ruta para cada contacto que llega a la actividad en el Journey.
 * Está protegido por JWT. La lógica principal de la actividad reside aquí.
 */
router.post("/execute", verifyJWT, async (req, res) => {
  log("Procesando petición execute");
  
  try {
    // El middleware verifyJWT ya ha decodificado el token y ha puesto su contenido en req.activityPayload.
    const activityPayload = req.activityPayload;
    // Extraer los argumentos de configuración guardados desde el payload del token.
    const inArgs = activityPayload.inArguments || [];
                      
    // Obtener los valores de configuración guardados usando función de utilidad.
    const customText = getInArgValue(inArgs, 'customText'); 
    const selectedTemplate = getInArgValue(inArgs, 'selectedTemplate'); 
    const selectedTemplateId = getInArgValue(inArgs, 'selectedTemplateId'); 
    const selectedTemplateMessage = getInArgValue(inArgs, 'selectedTemplateMessage'); 
    const phone = getInArgValue(inArgs, 'phone'); 
    const message = getInArgValue(inArgs, 'message'); 
    const from = getInArgValue(inArgs, 'from');

    let messageToSend = getInArgValue(inArgs, 'selectedTemplateMessage'); 

    log("Valores recibidos:", {customText, selectedTemplate, selectedTemplateId, selectedTemplateMessage, phone, message, from });

    // Preparar el cuerpo de la petición (payload) que se enviará al servicio externo.
    const pushPayload = {
      contactKey: activityPayload.keyValue, // El ContactKey del Journey
      journeyId: activityPayload.journeyId, //Id del Journey
      dataFromActivity: {
        customText,
        selectedTemplate,
        selectedTemplateId,
        selectedTemplateMessage,
        phone,
        message,
        from 
      }
    };
    
    // Llamar al servicio externo para enviar el push.
    const pushResponse = await sendPush(pushPayload);

    // Validar la respuesta del servicio externo.
    if (pushResponse.status >= 200 && pushResponse.status < 300) {
      log("Llamada al servicio push realizada con éxito", { 
        status: pushResponse.status,
        response: pushResponse.data 
      });
      
      // Devolver una respuesta de éxito a Marketing Cloud.
      return res.status(200).json({ 
        status: "ok", 
        result: pushResponse.data
      });
    } else {
      // Si el servicio externo devuelve un error, lo lanzamos para que lo capture el bloque catch.
      throw new Error(`El servicio push respondió con un estado inesperado: ${pushResponse.status}`);
    }
  } catch (pushError) {
    log("Error durante la ejecución del push", { 
        error: pushError.message, 
        status: pushError.response?.status,
        data: pushError.response?.data
      });
      
    // Devolver una respuesta de error a Marketing Cloud.
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

// Exportar el router para que pueda ser importado y utilizado en index.js
module.exports = router;