define([
    'postmonger'
], function(
    Postmonger
) {
    'use strict';

    var connection = new Postmonger.Session();
    var payload = {};
    var lastStepEnabled = false;
    var steps = [ 
        { "label": "Configuración SMS", "key": "step1" }
    ];
    var currentStep = steps[0].key;

    $(window).ready(onRender);

    connection.on('initActivity', initialize);
    connection.on('requestedTokens', onGetTokens);
    connection.on('requestedEndpoints', onGetEndpoints);
    connection.on('requestedSchema', onGetSchema);
    connection.on('clickedNext', onClickedNext);
    connection.on('clickedBack', onClickedBack);
    connection.on('gotoStep', onGotoStep);

    function onRender() {
        // JB will respond the first time 'ready' is called with 'initActivity'
        connection.trigger('ready');
        connection.trigger('requestTokens');
        connection.trigger('requestEndpoints');
    }

    function initialize(data) {
        if (data) {
            payload = data;
        }
        
        var hasInArguments = Boolean(
            payload['arguments'] &&
            payload['arguments'].execute &&
            payload['arguments'].execute.inArguments &&
            payload['arguments'].execute.inArguments.length > 0
        );

        var inArguments = hasInArguments ? payload['arguments'].execute.inArguments : [];

        $.each(inArguments, function(index, inArgument) {
            $.each(inArgument, function(key, val) {
                // Recuperar valores guardados previamente
                if (key === 'phone') {
                    $('#phone').val(val);
                } else if (key === 'message') {
                    $('#message').val(val);
                } else if (key === 'from') {
                    $('#from').val(val);
                }
            });
        });

        connection.trigger('updateButton', {
            button: 'next',
            text: 'Guardar',
            enabled: true
        });
    }

    function onGetTokens(tokens) {
        // Almacenar tokens si es necesario
    }

    function onGetEndpoints(endpoints) {
        // Procesar endpoints si es necesario
    }

    function onGetSchema(schema) {
        // Procesar schema para campos relevantes si es necesario
    }

    function onClickedNext() {
        if (currentStep === 'step1') {
            save();
        }
    }

    function onClickedBack() {
        connection.trigger('prevStep');
    }

    function onGotoStep(step) {
        currentStep = step.key;
        
        if (step.key === 'step1') {
            connection.trigger('updateButton', {
                button: 'next',
                text: 'Guardar',
                enabled: true
            });
        }
    }

    function save() {
        // Obtener valores de la interfaz de usuario
        var phoneValue = $('#phone').val();
        var messageValue = $('#message').val();
        var fromValue = $('#from').val();
        
        payload['arguments'].execute.inArguments = [{
            "phone": phoneValue,
            "message": messageValue,
            "from": fromValue
        }];
        
        payload['metaData'].isConfigured = true;
        
        connection.trigger('updateActivity', payload);
    }
});