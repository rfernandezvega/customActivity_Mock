// Esperar a que el DOM esté completamente cargado antes de ejecutar el script
document.addEventListener('DOMContentLoaded', () => {

  // Iniciar comunicación con Journey Builder
  const connection = new Postmonger.Session();

  // Payload para pasarle a la actividad con la configuración
  let payload = {};
  
  // Almacenará los campos de la DE
  let schemaFields = [];

  // Almacenará las plantillas para la picklist
  let deTemplates = []; 
  
  // Campos que queremos obtener de la DE. Se indican aquí para que, si luego se cambia el nombre, no se tenga que modificar en más sitios.
  const requiredFields = {
    phone: 'MobilePhone',
    message: 'SMSMessage',
    from: 'SMSFrom'
  };

  /*
    Los siguientes bloques son listeners que se ejecutan cuando los llama Journey Builder (on) o los requiere la app (trigger)
    https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/using-postmonger.html
  */
  
  /* 
    Cuando se inicia la actividad (se arrastra la actividad al canvas o se hace click) se revisa si data contiene la configuración guardada.
    Si la tiene se pasa al payload y se monta la estructura que esta definida en el config.json
  */
  connection.on("initActivity", function(data) 
  {
    if (data) {
      payload = data;
    }
      
    /* Este bloque es una medida de seguridad. Se asegura de que la estructura payload.arguments.execute.inArguments 
        exista, incluso si la actividad es nueva 
      Si no se hiciera esto y se tratara de utilizar payload.arguments.execute.inArguments.push() (más adelante), 
      daría un error porque se está intentando acceder a una propiedad (push) de algo que no existe (undefined).
      En este caso, no se está guardando nada en el /save, por lo que es necesario definirlo.
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

    // Solicitar schema de entrada al journey. Es decir, se solicita la lista de todos los campos disponibles en la DE de entrada.
    connection.trigger('requestSchema');       
    
  });

  /* 
    Este listener se dispara cuando MC envía el esquema de la DE.
    Su responsabilidad es orquestar la carga de todo el contenido dinámico.
    Se ha solicitado al cargar la actividad.

    El objetivo es construir los inArguments, que es la parte más importante del payload. 
    Los inArguments le indican al endpoint /execute de dónde sacar los valores datos.
  */
  connection.on('requestedSchema', async function (data) {
    const loaderContainer = document.getElementById('loader-container');
    const formContainer = document.getElementById('form-container');

    try {
      // Verificar si tenemos schema
      if (!data || !data.schema || data.schema.length === 0) {
        loaderContainer.innerHTML = '<p>Debes configurar primero la entrada al Journey</p>';
        loaderContainer.className = 'error';
        formContainer.style.display = 'none';
        connection.trigger('updateButton', { button: 'next', enabled: false });
        return;
      }
      loaderContainer.style.display = 'none';
      formContainer.style.display = 'block';

      // --- Paso 1: Construir la parte síncrona (lista de campos de la DE) ---
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
        option.value = `{{${field.key}}}`; // El valor guardado (ej: "{{Event.APIEvent-XYZ.FirstName}}")
        deFieldSelect.appendChild(option);
      });
      
      // --- Paso 2: ESPERAR a que la parte asíncrona (templates) termine de construirse ---
      await populateDETemplates();

      // --- Paso 3: AHORA, y solo ahora, rellenamos el formulario con los datos guardados ---
      loadFormData();

      // --- Paso 4: Añadimos los listeners de eventos ---
      document.getElementById('template-de-picklist').addEventListener('change', updateMessagePreview);

      /* Le decimos a Journey Builder que active el botón "Siguiente" / "Hecho". 
        Si no hicieras esto, el botón estaría deshabilitado y el usuario no podría guardar la configuración.
      */
      connection.trigger('updateButton', { button: 'next', enabled: true });
      
    } catch (error) {
      console.error("Error al procesar schema:", error);
    }
  });

  // Cuando se hace clic en Done/Next
  connection.on("clickedNext", function() {
    try 
    {
      // Recoge todos los datos del formulario
      saveFormDataToPayload(); 
      // Se le indica a Journey Builder que debe cerrar la ventana y que la configuración está lista
      connection.trigger("updateActivity", payload);
    } catch (error) {
      console.error("Error al guardar:", error);
    }
  });

  // Notificar que estamos listos. La primera vez que se usar el ready, JB llama a initActivity o initEvent.
  connection.trigger("ready");


  //  Función para poblar los templates desde la DE 
  /**
   * Llama al backend para obtener los templates de la DE y rellena la lista de selección.
   */
  async function populateDETemplates() {
    const select = document.getElementById('template-de-picklist');
    try {
      // La URL debe apuntar a tu servidor.
      const response = await fetch('/api/templates');
      if (!response.ok) {
        throw new Error(`El servidor respondió con estado ${response.status}`);
      }

      deTemplates = await response.json();

      select.innerHTML = ''; // Limpiar el mensaje de "Cargando..."
      
      if (deTemplates.length === 0) {
        select.innerHTML = '<option value="">-- No se encontraron templates --</option>';
        return;
      }

      // Añadir una opción por defecto
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.innerText = '-- Seleccione una plantilla --';
      select.appendChild(defaultOption);

      deTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.innerText = template.name;
        // Guardamos el mensaje en el propio elemento HTML para fácil acceso
        option.setAttribute('data-message', template.message);
        select.appendChild(option);
      });

    } catch (error) {
      console.error('Error al cargar templates de la DE:', error);
      select.innerHTML = '<option value="">-- Error al cargar --</option>';
    }
  }

  /**
   * Lee los datos del 'payload' y los usa para rellenar los campos del formulario.
   * Esto asegura que al editar una actividad, el usuario vea su configuración anterior.
   */
  function loadFormData() {
    if (payload.arguments && payload.arguments.execute && payload.arguments.execute.inArguments.length > 0) 
    {
      const inArgs = payload.arguments.execute.inArguments[0];

      // Rellenar cada campo del formulario con el valor guardado o un valor por defecto
      document.getElementById('text-input').value = inArgs.customText || '';
      document.getElementById('template-picklist').value = inArgs.selectedTemplate || 'Template1';
      document.getElementById('de-field-picklist').value = inArgs.selectedDEField || '';

      const selectedTemplateId = inArgs.selectedTemplateId || '';
      document.getElementById('template-de-picklist').value = selectedTemplateId;
      
      // Si hay un template seleccionado al cargar, mostrar su mensaje
      updateMessagePreview();
    }
  }

  // Función para actualizar la vista previa 
  /**
   * Se ejecuta cada vez que el usuario cambia la selección del desplegable de templates.
   */
  function updateMessagePreview() {
    const select = document.getElementById('template-de-picklist');
    const previewContainer = document.getElementById('template-message-preview');
    const messageTextSpan = document.getElementById('message-text');
    
    const selectedId = select.value;

    // Si no hay nada seleccionado, ocultar la vista previa
    if (!selectedId) {
      previewContainer.style.display = 'none';
      return;
    }
    
    // Buscar el template seleccionado en nuestro array de templates guardados
    const selectedTemplate = deTemplates.find(t => String(t.id) === selectedId);

    if (selectedTemplate && selectedTemplate.message) {
      // Si encontramos el template y tiene un mensaje, lo mostramos
      messageTextSpan.innerText = selectedTemplate.message;
      previewContainer.style.display = 'block';
    } else {
      // Si no, ocultamos la vista previa (por si acaso)
      previewContainer.style.display = 'none';
    }
  }

  // Función para guardar los datos del formulario en el payload 
  /**
   * Recoge todos los valores actuales del formulario y los guarda en la estructura
   * 'inArguments' del payload.
   */
  function saveFormDataToPayload() {
    const inArgs = {};

    // Recoge los valores de los campos del formulario
    inArgs.customText = document.getElementById('text-input').value;
    inArgs.selectedTemplate = document.getElementById('template-picklist').value;
    inArgs.selectedDEField = document.getElementById('de-field-picklist').value;
    
    // --- Lógica de guardado rediseñada ---
    const templateSelect = document.getElementById('template-de-picklist');
    const selectedTemplateId = templateSelect.value;
    inArgs.selectedTemplateId = selectedTemplateId;

    // Si hay una opción seleccionada...
    if (selectedTemplateId) {
        // Obtenemos el elemento <option> seleccionado
        const selectedOption = templateSelect.options[templateSelect.selectedIndex];
        if (selectedOption) {
            // Leemos el mensaje directamente desde su atributo data-message
            inArgs.selectedTemplateMessage = selectedOption.getAttribute('data-message');
        }
    }

    // Añadir los valores "hard-coded" (phone, message, etc.) usando el esquema guardado
    // Extraer el eventDefinitionKey (UUID del evento)
    // Formato ejemplo de la Key: Event.APIEvent-1a11c-7952-488a-99d7-069fa2bc543c.Id
    let eventDefinitionKey = "";
    if (schemaFields.length > 0) {
      const firstKey = schemaFields[0].key;
      const parts = firstKey.split('.');
      if (parts.length >= 2) {
        eventDefinitionKey = parts[1];
      }
    }        
    
    /* 
      Si encontramos el eventDefinitionKey, crear bindings completos 
      Esto se podría indicar directamente en el config.json, pero en este caso los nombres
      de los campos de la DE siempre deberían ser los indicados en el archivo de configuración.
    */
    if (eventDefinitionKey) {
      inArgs.phone = `{{Event.${eventDefinitionKey}.${requiredFields.phone}}}`;
      inArgs.message = `{{Event.${eventDefinitionKey}.${requiredFields.message}}}`;
      inArgs.from = `{{Event.${eventDefinitionKey}.${requiredFields.from}}}`;
    } else {
      // Si no encontramos el eventDefinitionKey, se puede intentar recuperar de ContactData
      inArgs.phone = `{{Contact.Attribute.DataExtension.${requiredFields.phone}}}`;
      inArgs.message = `{{Contact.Attribute.DataExtension.${requiredFields.message}}}`;
      inArgs.from = `{{Contact.Attribute.DataExtension.${requiredFields.from}}}`;
    }

    // Reemplazar los argumentos en el payload con el nuevo objeto construido
    payload.arguments.execute.inArguments = [inArgs];

    // Marcar la actividad como configurada. Necesario para que JB permita activar
    if (!payload.metaData) {
      payload.metaData = {};
    }
    payload.metaData.isConfigured = true;
  }

});