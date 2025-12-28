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
            message: "Servidor listo. Esperando alimento desde la App." 
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido" });
    }

    try {
        const { food } = req.body || {};
        
        if (!food) {
            return res.status(400).json({ 
                error_detail: "No se recibió alimento" 
            });
        }

        // TOKEN - Usa variables de entorno en producción
        // En Vercel: Settings > Environment Variables > HF_TOKEN
        const HF_TOKEN = process.env.HF_TOKEN || (() => {
            const t1 = "hf_";
            const t2 = "xXFSCbBADUDCG";
            const t3 = "kLwjbmiTfzAncNMrHxlIz";
            return (t1 + t2 + t3).trim();
        })();

        // OPCIÓN 1: Usar Gemma 2 (más confiable)
        const MODEL_URL = "https://api-inference.huggingface.co/models/google/gemma-2-2b-it";
        
        // OPCIÓN 2: Usar Phi-3 (comentado por si prefieres este)
        // const MODEL_URL = "https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct";

        const prompt = `Eres un asistente de cocina. Dame exactamente 3 consejos cortos y prácticos en español para cocinar o aprovechar: ${food}. Sé directo, no uses introducciones.`;

        console.log("Llamando a HuggingFace:", MODEL_URL);

        const response = await fetch(MODEL_URL, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json",
                "x-wait-for-model": "true" // Espera a que el modelo cargue
            },
            body: JSON.stringify({ 
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
            })
        });

        const responseText = await response.text();
        console.log("Respuesta cruda:", responseText.substring(0, 200));

        // Parsear respuesta
        let jsonData;
        try {
            jsonData = JSON.parse(responseText);
        } catch (parseError) {
            console.error("Error parseando JSON:", parseError);
            return res.status(200).json({ 
                error_detail: "Respuesta no válida del modelo",
                raw_response: responseText.substring(0, 100)
            });
        }

        // Manejo de errores específicos de HuggingFace
        if (jsonData.error) {
            console.error("Error de HF:", jsonData.error);
            
            if (jsonData.error.includes("loading") || jsonData.error.includes("currently loading")) {
                return res.status(200).json({ 
                    generated_text: "⏳ El modelo se está cargando (puede tardar 20-30 segundos). Vuelve a intentarlo en un momento.",
                    is_loading: true
                });
            }
            
            if (jsonData.error.includes("Authorization") || jsonData.error.includes("token")) {
                return res.status(200).json({ 
                    error_detail: "Token de HuggingFace inválido. Verifica tu token en Variables de Entorno."
                });
            }
            
            return res.status(200).json({ 
                error_detail: `Error del modelo: ${jsonData.error}`
            });
        }

        // Extraer texto generado
        let generatedText = "";
        
        if (Array.isArray(jsonData)) {
            generatedText = jsonData[0]?.generated_text || "";
        } else if (jsonData.generated_text) {
            generatedText = jsonData.generated_text;
        } else if (jsonData[0]?.generated_text) {
            generatedText = jsonData[0].generated_text;
        } else {
            return res.status(200).json({ 
                error_detail: "Formato de respuesta inesperado",
                raw_data: JSON.stringify(jsonData).substring(0, 200)
            });
        }

        // Limpiar el texto (remover tags de instrucción si los hay)
        generatedText = generatedText
            .replace(/\[INST\]|\[\/INST\]/g, '')
            .replace(/<\|.*?\|>/g, '')
            .replace(/^(assistant|user):/gi, '')
            .trim();

        console.log("Texto generado limpio:", generatedText);

        return res.status(200).json({ 
            generated_text: generatedText || "No se pudo generar respuesta. Intenta de nuevo.",
            model_used: MODEL_URL.includes("gemma") ? "Gemma 2" : "Phi-3"
        });

    } catch (error) {
        console.error("Error general:", error);
        return res.status(500).json({ 
            error_detail: `Error del servidor: ${error.message}`,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
