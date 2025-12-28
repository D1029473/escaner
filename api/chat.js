export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { food } = req.body;
        if (!food) return res.status(200).json({ error_detail: "No se detectó alimento" });

        // --- TOKEN (Limpio de espacios) ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // NUEVA URL: Formato directo del Router para Inferencia
        const apiUrl = "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 consejos de cocina cortos para aprovechar: ${food} [/INST]`,
                parameters: { max_new_tokens: 100 }
            }),
        });

        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            
            if (!response.ok) {
                return res.status(200).json({ error_detail: jsonData.error || "Error en el modelo" });
            }

            // El modelo devuelve un array con el texto generado
            let output = Array.isArray(jsonData) ? jsonData[0].generated_text : jsonData.generated_text;
            
            // Limpiar la respuesta para que no incluya la pregunta
            if (output.includes("[/INST]")) {
                output = output.split("[/INST]").pop().trim();
            }

            return res.status(200).json({ generated_text: output });

        } catch (e) {
            // Si esto falla, veremos qué texto exacto está devolviendo el Router
            return res.status(200).json({ error_detail: "Respuesta del Router: " + textData.substring(0, 50) });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Error de servidor: " + error.message });
    }
}
