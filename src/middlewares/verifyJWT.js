//Importa la libreria para poder validar el token JWT con el secret
const jwt = require("jsonwebtoken");
const log = require('../utils/logger');

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

module.exports = verifyJWT;