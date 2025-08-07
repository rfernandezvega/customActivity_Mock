/**
 * @file ui.js
 * @description Lógica del frontend para la interfaz de configuración de la Custom Activity.
 * Este script se comunica con Journey Builder a través de la librería Postmonger para
 * cargar datos, construir la interfaz de usuario dinámicamente y guardar la configuración
 * final de la actividad.
 */

// Esperar a que el DOM (la estructura HTML) esté completamente cargado antes de ejecutar el script.
// Esto previene errores al intentar acceder a elementos que aún no existen.
document.addEventListener('DOMContentLoaded', () => {

  // --- Variables Globales y Configuración ---

  // Iniciar la sesión de comunicación con Journey Builder. 'connection' es el objeto principal para enviar y recibir eventos.
  const connection = new Postmonger.Session();

  // Objeto que almacenará la configuración completa de la actividad. Se construye y modifica a lo largo del script.
  let payload = {};
  
  // Almacenará el esquema de la fuente de entrada del Journey (los campos de la DE) una vez recibido de Journey Builder.
  let schemaFields = [];

  // Almacenará la lista de templates (con id, nombre y mensaje) obtenida desde nuestro backend.
  let deTemplates = []; 
  
  // Campos "hard-coded" que la actividad siempre necesita resolver desde la fuente de entrada.
  // Definirlos aquí facilita el mantenimiento.
  const requiredFields = {
    phone: 'MobilePhone',
    message: 'SMSMessage',
    from: 'SMSFrom'
  };

  
  // --- Listeners de Eventos de Postmonger ---

  /*
    Documentación de Postmonger:
    https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/using-postmonger.html
  */
  
  /**
   * Evento 'initActivity': Se dispara una sola vez cuando la interfaz se carga.
   * Su propósito es inicializar el script, cargar la configuración guardada si existe,
   * y comenzar el proceso de obtención de datos dinámicos.
   * @param {object} data - Contiene el objeto 'payload' de una configuración guardada previamente. Es nulo si es una actividad nueva.
   */
  connection.on("initActivity", function(data) 
  {
    if (data) {
      payload = data;
    }
      
    /* 
      Este bloque es una medida de seguridad. Se asegura de que la estructura del payload
      (payload.arguments.execute.inArguments) exista, incluso si la actividad es nueva.
      Sin esto, intentar hacer .push() sobre un array indefinido causaría un error.
    */
    if (!payload.arguments) {
      payload.arguments = {};
    }
    if (!payload.arguments.execute) {
      payload.arguments.execute = {};
    }
    if (!payload.arguments.execute.inArguments) {
      payload.arguments.execute.inArguments = [{}];
    } 

    // Solicitar a Journey Builder el esquema de la fuente de entrada. Esto disparará el evento 'requestedSchema'.
    connection.trigger('requestSchema');       
  });

  /**
   * Evento 'requestedSchema': Se dispara cuando Journey Builder responde a nuestra petición de 'requestSchema'.
   * Es el orquestador principal de la UI: construye los desplegables dinámicos y luego rellena el formulario.
   * @param {object} data - Objeto que contiene la propiedad 'schema' con la lista de campos de la fuente de entrada.
   */
  connection.on('requestedSchema', async function (data) {
    const loaderContainer = document.getElementById('loader-container');
    const formContainer = document.getElementById('form-container');

    try {
      // Validar si la fuente de entrada está configurada. Si no, mostrar un error.
      if (!data || !data.schema || data.schema.length === 0) {
        loaderContainer.innerHTML = '<p>Debes configurar primero la entrada al Journey</p>';
        loaderContainer.className = 'error';
        formContainer.style.display = 'none';
        connection.trigger('updateButton', { button: 'next', enabled: false }); // Desactivar el botón de guardar.
        return;
      }

      // Si hay un esquema válido, ocultar el loader y mostrar el formulario.
      loaderContainer.style.display = 'none';
      formContainer.style.display = 'block';

      // --- Paso 1: Construir el desplegable de campos de la DE (síncrono) ---
      schemaFields = data.schema; 
      const deFieldSelect = document.getElementById('de-field-picklist');
      deFieldSelect.innerHTML = ''; 

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.innerText = '-- Seleccione un campo --';
      deFieldSelect.appendChild(defaultOption);

      schemaFields.forEach(field => {
        const option = document.createElement('option');
        option.innerText = field.name; // Lo que ve el usuario (ej: "FirstName")
        option.value = `{{${field.key}}}`; // El valor guardado, el data binding completo.
        deFieldSelect.appendChild(option);
      });
      
      // --- Paso 2: ESPERAR a que el desplegable de templates (asíncrono) termine de construirse ---
      await populateDETemplates();

      // --- Paso 3: AHORA que toda la UI está lista, rellenar el formulario con los datos guardados ---
      loadFormData();

      // --- Paso 4: Añadir el listener de eventos para la vista previa del mensaje ---
      document.getElementById('template-de-picklist').addEventListener('change', updateMessagePreview);

      // --- Paso 5: Activar el botón de "Hecho" de Journey Builder ---
      connection.trigger('updateButton', { button: 'next', enabled: true });
      
    } catch (error) {
      console.error("Error al procesar schema:", error);
    }
  });

  /**
   * Evento 'clickedNext': Se dispara cuando el usuario hace clic en el botón "Hecho" de Journey Builder.
   * Su única responsabilidad es guardar los datos del formulario en el payload y enviarlo a Journey Builder.
   */
  connection.on("clickedNext", function() {
    try 
    {
      saveFormDataToPayload(); 
      // Enviar el payload final a Journey Builder para que lo guarde.
      connection.trigger("updateActivity", payload);
    } catch (error) {
      console.error("Error al guardar:", error);
    }
  });

  // Notificar que estamos listos. Este es el primer trigger que se envía y causa que Journey Builder responda con 'initActivity'.
  connection.trigger("ready");


  // --- Funciones Auxiliares de la UI ---

  /**
   * Llama al endpoint /api/templates del backend para obtener los templates de la DE,
   * y luego construye las opciones del desplegable correspondiente.
   */
  async function populateDETemplates() {
    const select = document.getElementById('template-de-picklist');
    try {
      const response = await fetch('/api/templates');
      if (!response.ok) {
        throw new Error(`El servidor respondió con estado ${response.status}`);
      }

      // Guardar la lista completa de templates (con mensajes) en la variable global.
      deTemplates = await response.json();
      select.innerHTML = ''; // Limpiar el mensaje de "Cargando..."
      
      if (deTemplates.length === 0) {
        select.innerHTML = '<option value="">-- No se encontraron templates --</option>';
        return;
      }

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.innerText = '-- Seleccione una plantilla --';
      select.appendChild(defaultOption);

      deTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.innerText = template.name;
        // Guardamos el mensaje en un atributo 'data-*' en el propio elemento HTML.
        // Esto hace que el acceso posterior sea robusto y no dependa de la caché.
        option.setAttribute('data-message', template.message);
        select.appendChild(option);
      });

    } catch (error) {
      console.error('Error al cargar templates de la DE:', error);
      select.innerHTML = '<option value="">-- Error al cargar --</option>';
    }
  }

  /**
   * Lee la configuración guardada en el objeto 'payload' y la usa para
   * rellenar los campos del formulario con sus valores correspondientes.
   * Esto asegura que al editar una actividad, el usuario vea su configuración anterior.
   */
  function loadFormData() {
    if (payload.arguments && payload.arguments.execute && payload.arguments.execute.inArguments.length > 0) 
    {
      const inArgs = payload.arguments.execute.inArguments[0];

      // Rellenar cada campo del formulario con el valor guardado, o un valor por defecto si no existe.
      document.getElementById('text-input').value = inArgs.customText || '';
      document.getElementById('template-picklist').value = inArgs.selectedTemplate || 'Template1';
      document.getElementById('de-field-picklist').value = inArgs.selectedDEField || '';

      const selectedTemplateId = inArgs.selectedTemplateId || '';
      document.getElementById('template-de-picklist').value = selectedTemplateId;
      
      // Llamar a la función de vista previa para mostrar el mensaje si hay un template seleccionado al cargar.
      updateMessagePreview();
    }
  }

  /**
   * Muestra u oculta la vista previa del mensaje de la plantilla.
   * Se ejecuta cuando se carga el formulario y cada vez que el usuario cambia la
   * selección del desplegable de templates.
   */
  function updateMessagePreview() {
    const select = document.getElementById('template-de-picklist');
    const previewContainer = document.getElementById('template-message-preview');
    const messageTextSpan = document.getElementById('message-text');
    
    const selectedId = select.value;

    if (!selectedId) {
      previewContainer.style.display = 'none';
      return;
    }
    
    // Buscar el template seleccionado en nuestro array de templates en caché.
    const selectedTemplate = deTemplates.find(t => String(t.id) === selectedId);

    if (selectedTemplate && selectedTemplate.message) {
      // Si encontramos el template, mostramos su mensaje.
      messageTextSpan.innerText = selectedTemplate.message;
      previewContainer.style.display = 'block';
    } else {
      // Si no, ocultamos la vista previa.
      previewContainer.style.display = 'none';
    }
  }

  /**
   * Recoge todos los valores actuales del formulario y los guarda en la estructura
   * 'inArguments' del objeto 'payload'. También construye los data bindings necesarios.
   */
  function saveFormDataToPayload() {
    const inArgs = {};

    // Recoger los valores de cada campo del formulario.
    inArgs.customText = document.getElementById('text-input').value;
    inArgs.selectedTemplate = document.getElementById('template-picklist').value;
    inArgs.selectedDEField = document.getElementById('de-field-picklist').value;
    
   
    // --- Construcción de los Data Bindings ---
    // Extraer el eventDefinitionKey (UUID del evento) del esquema para crear bindings robustos.
    let eventDefinitionKey = "";
    if (schemaFields.length > 0) {
      const firstKey = schemaFields[0].key;
      const parts = firstKey.split('.');
      if (parts.length >= 2) {
        eventDefinitionKey = parts[1];
      }
    }        

    // Lógica para guardar el ID y el MENSAJE de la plantilla seleccionada 
    const templateSelect = document.getElementById('template-de-picklist');
    const selectedTemplateId = templateSelect.value;
    inArgs.selectedTemplateId = selectedTemplateId;

    if (selectedTemplateId) {
        const selectedOption = templateSelect.options[templateSelect.selectedIndex];
        if (selectedOption) 
        {
            // Seleccionamos el mensaje. Se podría recuperar de los valores del back que ya tenemos pero como se pinta se puede recuperar de ahí.
            const rawMessageTemplate = selectedOption.getAttribute('data-message');
            // Pre-personalizamos el mensaje antes de guardarlo en los inArguments.
            inArgs.selectedTemplateMessage = personalizeMessage(rawMessageTemplate, eventDefinitionKey);
        }
    }
    
    if (eventDefinitionKey) {
      inArgs.phone = `{{Event.${eventDefinitionKey}.${requiredFields.phone}}}`;
      inArgs.message = `{{Event.${eventDefinitionKey}.${requiredFields.message}}}`;
      inArgs.from = `{{Event.${eventDefinitionKey}.${requiredFields.from}}}`;
    } else {
      // Fallback si no se encuentra el eventDefinitionKey. Esto no es obligatorio pero permite buscar en ContactData
      inArgs.phone = `{{Contact.Attribute.DataExtension.${requiredFields.phone}}}`;
      inArgs.message = `{{Contact.Attribute.DataExtension.${requiredFields.message}}}`;
      inArgs.from = `{{Contact.Attribute.DataExtension.${requiredFields.from}}}`;
    }

    // Reemplazar los argumentos en el payload con el nuevo objeto construido.
    payload.arguments.execute.inArguments = [inArgs];

    // Marcar la actividad como configurada. Necesario para que JB permita activar.
    if (!payload.metaData) {
      payload.metaData = {};
    }
    payload.metaData.isConfigured = true;
  }

  // Función de pre-personalización 
  /**
   * Pre-procesa una plantilla de mensaje para convertir placeholders en data bindings.
   * Busca %%FieldName%% y lo reemplaza con el data binding correspondiente de Journey Builder,
   * como "{{Event.APIEvent-XYZ.FieldName}}".
   * 
   * @param {string} messageTemplate - El texto de la plantilla (ej: "Hola %%FirstName%%").
   * @param {string} eventDefinitionKey - El UUID del evento de entrada del Journey.
   * @returns {string} - El mensaje con los placeholders convertidos en data bindings.
   */
  function personalizeMessage(messageTemplate, eventDefinitionKey) {
    if (!messageTemplate || !eventDefinitionKey || schemaFields.length === 0) {
      return messageTemplate;
    }

    /* 
        Expresión regular para encontrar todos los placeholders %%...%%

        / ... /: Delimitadores de la expresión regular.
        %%: Busca el literal "%%".
        (.*?): 
            . significa "cualquier carácter".
            * significa "cero o más veces".
            ? lo hace "non-greedy", lo que significa que se detiene en la primera coincidencia que encuentra.
            (...) captura el contenido que coincide (el nombre del campo).
        %%: Busca el cierre literal "%%".
        g: Esta es el indicador global. Indica al método .replace() que siga tras la primera coincidencia para seguir reemplazando
    */
    const personalizedMessage = messageTemplate.replace(/%%(.*?)%%/g, (match, fieldName) => {
      const trimmedFieldName = fieldName.trim();

      // Buscar en el esquema el campo que coincide con el placeholder.
      // Hacemos la comparación en minúsculas para que no sea sensible a mayúsculas/minúsculas.
      const schemaField = schemaFields.find(field => field.name.toLowerCase() === trimmedFieldName.toLowerCase());

      if (schemaField) {
        /*  Si encontramos una coincidencia, construimos y devolvemos el data binding completo.
            Usamos schemaField.key, que ya contiene la ruta completa.
            Lo devuelve asi: 
            {
                name: "Campo",
                key: "Event.APIEvent-1234-ABCD.Campo"
            }
        */
        return `{{${schemaField.key}}}`;
      } else {
        // Si no se encuentra un campo coincidente en el esquema, se deja el placeholder original.
        return match;
      }
    });

    return personalizedMessage;
  }

}); // Fin del listener DOMContentLoaded