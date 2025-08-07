//Framework para Node.js
const express = require("express");
//Modulo nativo de Node.js para manejar rutas de archivos
const path = require("path");
// Importar nuestro logger y las rutas de la actividad
const log = require('./src/utils/logger');
const activityRoutes = require('./src/routes/activityRoutes');

const app = express();

/*
  Process: objeto global incorporado en Node.js
  Es un objeto que representa el proceso en ejecución de Node.js.
  Da acceso a información del entorno, argumentos del sistema, eventos, etc
*/
const port = process.env.PORT || 3000;

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

// --- Montar las Rutas ---
// Le decimos a Express que todas las peticiones deben ser manejadas por nuestro router.
app.use('/', activityRoutes);


// Se encarga de que el servidor Express empiece a "escuchar" solicitudes HTTP en el puerto definido por port
app.listen(port, () => {
  log(`Servidor iniciado en puerto ${port}`);
});