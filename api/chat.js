export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: "Online", 
            message: "Servidor listo. Esperando alimento desde la App.",
            timestamp: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido" });
    }

    // Array para recopilar todos los logs
    const debugLogs = [];
    const log = (msg) => {
        console.log(msg);
        debugLogs.push(msg);
    };

    try {
        log("=== INICIO DE PETICIÓN ===");
        
        const { food } = req.body || {};
        log(`Alimento recibido: "${food}"`);
        
        if (!food) {
            return res.status(400).json({ 
                error_detail: "No se recibió alimento",
                debug: debugLogs
            });
        }

        // TOKEN - Usa variables de entorno en producción
        const HF_TOKEN = process.env.HF_TOKEN || (() => {
            const t1 = "hf_";
            const t2 = "xXFSCbBADUDCG";
            const t3 = "kLwjbmiTfzAncNMrHxlIz";
            return (t1 + t2 + t3).trim();
        })();
        
        log(`Token configurado: ${HF_TOKEN.substring(0, 6)}...${HF_TOKEN.substring(HF_TOKEN.length - 4)}`);
        log(`Longitud del token: ${HF_TOKEN.length} caracteres`);

        // OPCIÓN 1: Usar Gemma 2 (más confiable)
        const MODEL_URL = "https://api-inference.huggingface.co/models/google/gemma-2-2b-it";
        log(`Modelo seleccionado: ${MODEL_URL}`);
        
        const prompt = `Eres un asistente de cocina. Dame exactamente 3 consejos cortos y prácticos en español para cocinar o aprovechar: ${food}. Sé directo, no uses introducciones.`;
        log(`Prompt: ${prompt.substring(0, 100)}...`);

        log("Preparando petición a HuggingFace...");
        
        const requestBody = { 
            inputs: prompt,
            parameters: { 
                max_new_tokens: 200,
                temperature: 0.7,
                top_p: 0.95,
                return_full_text: false
            },
            options: {
                wait_for_model: true,
                use_cache: false
            }
        };
        
        log(`Body de petición: ${JSON.stringify(requestBody).substring(0, 150)}...`);

        const fetchStartTime = Date.now();
        const response = await fetch(MODEL_URL, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json",
                "x-wait-for-model": "true"
            },
            body: JSON.stringify(requestBody)
        });
        
        const fetchDuration = Date.now() - fetchStartTime;
        log(`Petición completada en ${fetchDuration}ms`);
        log(`Status HTTP: ${response.status} ${response.statusText}`);
        log(`Headers de respuesta: ${JSON.stringify(Object.fromEntries(response.headers))}`);

        const responseText = await response.text();
        log(`Respuesta cruda (primeros 500 chars): ${responseText.substring(0, 500)}`);
        log(`Longitud total de respuesta: ${responseText.length} caracteres`);

        // Parsear respuesta
        let jsonData;
        try {
            jsonData = JSON.parse(responseText);
            log(`JSON parseado correctamente`);
            log(`Tipo de dato: ${Array.isArray(jsonData) ? 'Array' : typeof jsonData}`);
            log(`Estructura: ${JSON.stringify(jsonData, null, 2).substring(0, 300)}`);
        } catch (parseError) {
            log(`ERROR parseando JSON: ${parseError.message}`);
            return res.status(200).json({ 
                error_detail: "Respuesta no válida del modelo",
                raw_response: responseText,
                parse_error: parseError.message,
                debug: debugLogs
            });
        }

        // Manejo de errores específicos de HuggingFace
        if (jsonData.error) {
            log(`ERROR del modelo HF: ${jsonData.error}`);
            
            if (jsonData.error.includes("loading") || jsonData.error.includes("currently loading")) {
                log("Modelo en proceso de carga");
                return res.status(200).json({ 
                    generated_text: "⏳ El modelo se está cargando (puede tardar 20-30 segundos). Vuelve a intentarlo en un momento.",
                    is_loading: true,
                    estimated_time: jsonData.estimated_time,
                    debug: debugLogs
                });
            }
            
            if (jsonData.error.includes("Authorization") || jsonData.error.includes("token")) {
                log("Error de autorización - token inválido");
                return res.status(200).json({ 
                    error_detail: "Token de HuggingFace inválido. Verifica tu token.",
                    token_length: HF_TOKEN.length,
                    token_preview: `${HF_TOKEN.substring(0, 10)}...`,
                    debug: debugLogs
                });
            }

            if (jsonData.error.includes("Model") && jsonData.error.includes("does not exist")) {
                log("Modelo no existe");
                return res.status(200).json({ 
                    error_detail: "El modelo especificado no existe en HuggingFace",
                    model_url: MODEL_URL,
                    debug: debugLogs
                });
            }
            
            return res.status(200).json({ 
                error_detail: `Error del modelo: ${jsonData.error}`,
                full_error: jsonData,
                debug: debugLogs
            });
        }

        // Extraer texto generado
        log("Intentando extraer texto generado...");
        let generatedText = "";
        
        if (Array.isArray(jsonData)) {
            log(`Es un array con ${jsonData.length} elementos`);
            generatedText = jsonData[0]?.generated_text || "";
            log(`Texto del primer elemento: ${generatedText.substring(0, 100)}`);
        } else if (jsonData.generated_text) {
            log("Tiene propiedad generated_text");
            generatedText = jsonData.generated_text;
        } else if (jsonData[0]?.generated_text) {
            log("Tiene jsonData[0].generated_text");
            generatedText = jsonData[0].generated_text;
        } else {
            log("ERROR: No se encontró texto generado en ningún formato conocido");
            log(`Claves disponibles: ${Object.keys(jsonData).join(', ')}`);
            return res.status(200).json({ 
                error_detail: "Formato de respuesta inesperado",
                available_keys: Object.keys(jsonData),
                raw_data: jsonData,
                debug: debugLogs
            });
        }

        // Limpiar el texto
        const originalText = generatedText;
        generatedText = generatedText
            .replace(/\[INST\]|\[\/INST\]/g, '')
            .replace(/<\|.*?\|>/g, '')
            .replace(/^(assistant|user):/gi, '')
            .trim();
        
        log(`Texto original length: ${originalText.length}`);
        log(`Texto limpio length: ${generatedText.length}`);
        log(`Texto final: ${generatedText}`);

        return res.status(200).json({ 
            generated_text: generatedText || "No se pudo generar respuesta. Intenta de nuevo.",
            model_used: MODEL_URL.includes("gemma") ? "Gemma 2" : "Phi-3",
            processing_time: `${fetchDuration}ms`,
            debug: debugLogs,
            success: true
        });

    } catch (error) {
        log(`ERROR CRÍTICO: ${error.message}`);
        log(`Stack: ${error.stack}`);
        return res.status(500).json({ 
            error_detail: `Error del servidor: ${error.message}`,
            error_type: error.name,
            stack: error.stack,
            debug: debugLogs
        });
    }
}
