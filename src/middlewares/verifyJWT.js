/**
 * @file verifyJWT.js
 * @description Middleware de Express para autenticar las peticiones entrantes de Marketing Cloud.
 * Este middleware verifica la firma de un JSON Web Token (JWT) para asegurar que la
 * petición es legítima y no ha sido alterada.
 */

//Importa la libreria para poder validar el token JWT con el secret
const jwt = require("jsonwebtoken");
const log = require('../utils/logger');

/**
 * Middleware de Express para la validación de JWT.
 * 
 * Marketing Cloud envía un JWT de dos maneras diferentes dependiendo del endpoint:
 * 1. Para `/execute`: El cuerpo de la petición (body) es la cadena del JWT en crudo (`Content-Type: application/jwt`).
 * 2. Para otros endpoints del ciclo de vida (`/save`, `/validate`): Puede enviar un objeto JSON que contiene una propiedad 'token'.
 * 
 * Este middleware maneja ambos casos. Si la verificación es exitosa, decodifica el token
 * y adjunta su contenido (el payload de la actividad) a `req.activityPayload` para que
 * los siguientes manejadores de ruta puedan utilizarlo.
 * 
 * @param {object} req - El objeto de la petición de Express.
 * @param {object} res - El objeto de la respuesta de Express.
 * @param {function} next - La función de callback para pasar el control al siguiente middleware.
 */
function verifyJWT(req, res, next) 
{
  log("--- Validación JWT ---");
  log("Cabeceras de la petición:", req.headers);
  log("Cuerpo completo de la petición:", req.body);

  let token;
  // Comprobar si el cuerpo de la petición es una cadena de texto. Este es el caso para `Content-Type: application/jwt`.
  if (typeof req.body === 'string' && req.body.length > 0) {
    token = req.body;
  } else if (req.body && req.body.token) {
    // Fallback por si el token viene dentro de un objeto JSON, como `{"token": "ey..."}`.
    token = req.body.token;
  }

  // Si después de ambas comprobaciones no hemos encontrado un token, la petición no es válida.
  if (!token) {
    log("Error de autenticación: No se encontró token en un formato válido.");
    return res.status(401).json({ error: "Token JWT no encontrado" });
  }

  // Recuperar el secreto de JWT desde las variables de entorno. Es crucial que esté configurado.
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
      log("Error de configuración del servidor: JWT_SECRET no definido.");
      return res.status(500).json({ error: "Secreto de JWT no configurado en el servidor." });
  }

  /* 
    Utilizar la librería `jsonwebtoken` para verificar el token.
    Esta función realiza varias comprobaciones críticas de seguridad:
      - Valida que la firma del token se corresponda con el secreto (prueba de autenticidad).
      - Comprueba la fecha de expiración ('exp') del token para prevenir ataques de repetición.
      - Parsea el token para extraer su contenido (payload).
  */
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    // Si la verificación falla por cualquier motivo (firma incorrecta, expirado, malformado),
    // la librería devuelve un objeto de error.
    if (err) {
      log("Error de autenticación: Token inválido o expirado.", { error: err.message });
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    /* 
      Si el token es válido, la función te entrega un objeto llamado `decoded`, que es el
      contenido (payload) del token. Este payload contiene toda la información de la actividad
      que Journey Builder nos envía (inArguments, keyValue, etc.).

      Guardar estos datos en `req.activityPayload` (una propiedad personalizada que creamos en el objeto `req`)
      permite que el siguiente manejador en la cadena (por ejemplo, el handler de la ruta `/execute`)
      pueda acceder a estos datos de forma segura y conveniente.
    */
    req.activityPayload = decoded;

    log("Verificación JWT exitosa. Payload decodificado del token:", req.activityPayload);

    // Llamar a `next()` para pasar el control al siguiente middleware o al manejador de la ruta.
    // Si no se llama a next(), la petición se quedaría "colgada" y nunca terminaría.
    next();
  });
}

// Exportar la función del middleware para que pueda ser importada en otros archivos.
module.exports = verifyJWT;