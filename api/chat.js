export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { food } = req.body;
        if (!food) return res.status(200).json({ error_detail: "No se recibió alimento" });

        // --- TU TOKEN AQUÍ ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; // Pega la segunda parte
        const t3 = "kLwjbmiTfzAncNMrHxlIz"; // Pega la tercera parte
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // URL directa al modelo (Esta es la que menos falla)
        const apiUrl = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 consejos de cocina muy cortos para: ${food} [/INST]`,
                parameters: { max_new_tokens: 150 }
            }),
        });

        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            
            if (!response.ok) {
                return res.status(200).json({ error_detail: jsonData.error || "Error API" });
            }

            // Mistral en esta ruta devuelve un array o un objeto con el texto
            let finalResponse = Array.isArray(jsonData) ? jsonData[0].generated_text : jsonData.generated_text;
            
            // Limpiamos el texto para que no repita tu pregunta
            if (finalResponse.includes("[/INST]")) {
                finalResponse = finalResponse.split("[/INST]").pop().trim();
            }

            return res.status(200).json({ generated_text: finalResponse });

        } catch (e) {
            // Si esto sale, sabremos qué texto exacto nos está enviando Hugging Face
            return res.status(200).json({ error_detail: "Respuesta no esperada: " + textData.substring(0, 100) });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Error de servidor: " + error.message });
    }
}
