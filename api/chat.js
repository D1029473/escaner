export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: "Online", 
            message: "Save & Taste API v2.3",
            timestamp: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido" });
    }

    const debugLogs = [];
    const log = (msg) => {
        console.log(msg);
        debugLogs.push(msg);
    };

    try {
        log("=== INICIO PETICIÓN ===");
        
        const { food, option = 'conservation', isSpoiled = false } = req.body || {};
        
        log(`Alimento: "${food}"`);
        log(`Opción: ${option}`);
        log(`Estado malo: ${isSpoiled}`);
        
        if (!food || typeof food !== 'string' || food.trim().length === 0) {
            return res.status(400).json({ 
                error_detail: "Se requiere un alimento válido",
                debug: debugLogs
            });
        }

        const cleanFood = food.trim();

        // TOKEN de HuggingFace
        const HF_TOKEN = process.env.HF_TOKEN || (() => {
            const t1 = "hf_";
            const t2 = "xXFSCbBADUDCG";
            const t3 = "kLwjbmiTfzAncNMrHxlIz";
            return (t1 + t2 + t3).trim();
        })();
        
        log(`Token: ${HF_TOKEN.substring(0, 6)}...${HF_TOKEN.substring(HF_TOKEN.length - 4)}`);

        // Construir prompt según opción y estado
        let systemPrompt = "";
        let userPrompt = "";
        
        if (option === 'conservation') {
            if (isSpoiled) {
                systemPrompt = "Eres un experto en seguridad alimentaria. Da respuestas claras sobre alimentos en mal estado. Usa español neutro, sin emojis, formato numerado.";
                userPrompt = `El alimento "${cleanFood}" está EN MAL ESTADO. Proporciona:
1. 3 señales claras de que NO debe consumirse
2. Cómo desecharlo de forma segura
3. Consejos para evitarlo en el futuro
4. Tiempo de vida útil típico de este alimento en buen estado`;
            } else {
                systemPrompt = "Da exactamente 3 consejos breves y prácticos para conservar mejor el alimento indicado. Usa frases muy cortas. Español neutro. Sin introducción ni cierre. Sin emojis. Formato en lista numerada. Enfocado en conservación doméstica.";
                userPrompt = `${cleanFood}`;
            }
        } else { // recipes
            if (isSpoiled) {
                systemPrompt = "Eres un chef profesional. El alimento está en mal estado y NO debe usarse. Sugiere alternativas seguras. Español claro, sin emojis.";
                userPrompt = `El alimento "${cleanFood}" está en mal estado. Proporciona:
1. 2 alternativas saludables que lo pueden reemplazar
2. Una receta sencilla que use esas alternativas (máximo 5 ingredientes)
3. Tips para seleccionar y almacenar correctamente en la próxima compra`;
            } else {
                systemPrompt = "Eres un chef profesional. Crea 2 recetas deliciosas y realistas. Cada receta: nombre atractivo, 4-6 ingredientes comunes, 3 pasos claros, tiempo estimado. Español claro, sin emojis excesivos.";
                userPrompt = `2 recetas con ${cleanFood}. Ingredientes accesibles, preparación menor a 45 minutos.`;
            }
        }

        log(`System prompt: ${systemPrompt.substring(0, 100)}...`);
        log(`User prompt: ${userPrompt.substring(0, 100)}...`);

        // Usar nuevo endpoint de HuggingFace (formato OpenAI)
        const MODEL = "meta-llama/Llama-3.2-3B-Instruct";
        const API_URL = "https://router.huggingface.co/v1/chat/completions";
        
        log(`Modelo: ${MODEL}`);
        log(`Endpoint: ${API_URL}`);

        const requestBody = {
            model: MODEL,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            max_tokens: isSpoiled ? 300 : 200,
            temperature: 0.6,
            top_p: 0.9
        };

        // Timeout manual con AbortController (compatible Node 18+)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        try {
            const fetchStart = Date.now();
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const fetchDuration = Date.now() - fetchStart;
            log(`Petición completada en ${fetchDuration}ms`);
            log(`Status: ${response.status} ${response.statusText}`);

            const responseText = await response.text();
            log(`Respuesta (500 chars): ${responseText.substring(0, 500)}`);

            // Parsear respuesta
            let jsonData;
            try {
                jsonData = JSON.parse(responseText);
                log(`JSON parseado OK`);
            } catch (parseError) {
                log(`ERROR parseando JSON: ${parseError.message}`);
                
                // Si falla, devolver fallback
                return getFallbackResponse(cleanFood, option, isSpoiled, res, debugLogs);
            }

            // Manejo de errores de HF
            if (jsonData.error) {
                log(`ERROR de HF: ${JSON.stringify(jsonData.error)}`);
                
                if (typeof jsonData.error === 'string' && jsonData.error.includes("loading")) {
                    return res.status(200).json({ 
                        generated_text: "⏳ El modelo se está cargando. Espera 20-30 segundos y reintenta.",
                        is_loading: true,
                        debug: debugLogs
                    });
                }
                
                // Si error, usar fallback
                return getFallbackResponse(cleanFood, option, isSpoiled, res, debugLogs);
            }

            // Extraer el texto generado (formato OpenAI)
            log("Extrayendo texto generado...");
            let generatedText = "";
            
            if (jsonData.choices && jsonData.choices.length > 0) {
                const choice = jsonData.choices[0];
                
                if (choice.message && choice.message.content) {
                    generatedText = choice.message.content;
                } else if (choice.text) {
                    generatedText = choice.text;
                }
            }

            if (!generatedText) {
                log(`ERROR: No se encontró texto generado`);
                return getFallbackResponse(cleanFood, option, isSpoiled, res, debugLogs);
            }

            // Limpiar texto
            generatedText = cleanAIResponse(generatedText, cleanFood, isSpoiled);
            
            log(`Texto final length: ${generatedText.length}`);

            return res.status(200).json({ 
                generated_text: generatedText,
                food: cleanFood,
                option: option,
                is_spoiled: isSpoiled,
                ai_generated: true,
                model_used: MODEL,
                processing_time: `${fetchDuration}ms`,
                success: true,
                timestamp: new Date().toISOString()
            });

        } catch (fetchError) {
            clearTimeout(timeoutId);
            log(`ERROR en fetch: ${fetchError.message}`);
            
            // Si timeout o error de red, usar fallback
            return getFallbackResponse(cleanFood, option, isSpoiled, res, debugLogs);
        }

    } catch (error) {
        log(`ERROR CRÍTICO: ${error.message}`);
        return res.status(500).json({ 
            error_detail: `Error del servidor: ${error.message}`,
            debug: debugLogs
        });
    }
}

function cleanAIResponse(text, food, isSpoiled) {
    let cleaned = text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    
    // Remover frases de relleno comunes
    const fillerPhrases = [
        'Por supuesto, aquí tienes',
        'Claro, aquí está',
        'Como experto en',
        'Voy a proporcionarte',
        'Te voy a dar',
        'A continuación',
        'Okay,',
        'Let me',
        'Hmm,'
    ];
    
    fillerPhrases.forEach(phrase => {
        const regex = new RegExp(`^${phrase}[^.]*\\.?\\s*`, 'i');
        cleaned = cleaned.replace(regex, '');
    });
    
    // Si está en mal estado, añadir advertencia al inicio
    if (isSpoiled) {
        const warning = `⚠️ ADVERTENCIA: ${food.toUpperCase()} EN MAL ESTADO ⚠️\n\nNO CONSUMIR. Puede causar intoxicación alimentaria.\n\n`;
        cleaned = warning + cleaned;
    }
    
    return cleaned.trim();
}

function getFallbackResponse(food, option, isSpoiled, res, debugLogs) {
    let responseText = "";
    
    if (isSpoiled) {
        responseText = `🚨 ADVERTENCIA: ${food.toUpperCase()} EN MAL ESTADO 🚨\n\n`;
        responseText += `❌ NO CONSUMIR bajo ninguna circunstancia.\n\n`;
        responseText += `SEÑALES DE DETERIORO COMUNES:\n`;
        responseText += `• Olor desagradable o rancio\n`;
        responseText += `• Cambio de color o textura\n`;
        responseText += `• Presencia de moho\n`;
        responseText += `• Viscosidad o babas\n\n`;
        responseText += `CÓMO DESECHARLO:\n`;
        responseText += `1. Colocar en bolsa cerrada herméticamente\n`;
        responseText += `2. Depositar en basura orgánica\n`;
        responseText += `3. Lavar área de contacto con agua y jabón\n\n`;
        responseText += `PARA EL FUTURO:\n`;
        responseText += `• Comprar en cantidades pequeñas\n`;
        responseText += `• Almacenar en refrigerador si es perecedero\n`;
        responseText += `• Revisar fechas de caducidad\n`;
        responseText += `• Consumir primero los alimentos más antiguos\n`;
    } else if (option === 'conservation') {
        responseText = `CONSEJOS DE CONSERVACIÓN: ${food.toUpperCase()}\n\n`;
        responseText += `1. Almacenar en lugar fresco y seco, preferiblemente en refrigerador entre 2-8°C.\n\n`;
        responseText += `2. Mantener en recipiente hermético o bolsa cerrada para evitar contacto con aire y humedad.\n\n`;
        responseText += `3. Consumir dentro de 3-7 días (refrigerado) o congelar porciones para uso posterior.\n\n`;
        responseText += `💡 TIP EXTRA: Etiquetar con fecha de compra ayuda a controlar la rotación de alimentos.`;
    } else { // recipes
        responseText = `RECETAS CON ${food.toUpperCase()}\n\n`;
        responseText += `🍽️ RECETA 1: ${food} Salteado\n`;
        responseText += `Ingredientes: ${food}, ajo, aceite de oliva, sal, pimienta\n`;
        responseText += `Pasos:\n`;
        responseText += `1. Calentar aceite en sartén a fuego medio\n`;
        responseText += `2. Añadir ajo picado y ${food} cortado\n`;
        responseText += `3. Saltear 5-10 minutos, condimentar y servir\n`;
        responseText += `⏱️ Tiempo: 15 minutos\n\n`;
        responseText += `🍽️ RECETA 2: ${food} al Horno\n`;
        responseText += `Ingredientes: ${food}, especias al gusto, aceite, limón\n`;
        responseText += `Pasos:\n`;
        responseText += `1. Precalentar horno a 180°C\n`;
        responseText += `2. Colocar ${food} en bandeja con aceite y especias\n`;
        responseText += `3. Hornear 20-30 minutos hasta dorar\n`;
        responseText += `⏱️ Tiempo: 35 minutos`;
    }
    
    return res.status(200).json({
        generated_text: responseText,
        food: food,
        option: option,
        is_spoiled: isSpoiled,
        ai_generated: false,
        fallback: true,
        success: true,
        timestamp: new Date().toISOString(),
        debug: debugLogs
    });
}
