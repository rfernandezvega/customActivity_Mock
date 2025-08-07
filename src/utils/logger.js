// Funcion para logs de produccion - minimos pero informativos
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}:`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

/*
    Hace que la función de log esté disponible para ser utilizada en otros archivos del proyecto
    En Node.js, cada archivo es un módulo. 
    Para que una función, clase, objeto, etc., esté accesible fuera de ese archivo se debe exportar.

*/
module.exports = log;