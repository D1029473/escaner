export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: "Online", 
            message: "Servidor listo. Esperando alimento desde la App." 
        });
    }

    try {
        const { food } = req.body || {};
        if (!food) return res.status(200).json({ error_detail: "No se recibió alimento" });

        // --- TOKEN (Limpio de espacios) ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // URL CORREGIDA: Esta es la ruta exacta que el Router acepta para Mistral
        const apiUrl = "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 trucos cortos de cocina para: ${food} [/INST]`,
                parameters: { max_new_tokens: 100, return_full_text: false }
            }),
        });

        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            
            if (!response.ok) {
                // Si el error es "Model too busy", es que el servidor gratuito está cargado
                return res.status(200).json({ error_detail: jsonData.error || "Error en la IA" });
            }

            let output = Array.isArray(jsonData) ? jsonData[0].generated_text : jsonData.generated_text;
            if (output.includes("[/INST]")) output = output.split("[/INST]").pop().trim();

            return res.status(200).json({ generated_text: output });

        } catch (e) {
            // Si sale esto, sabremos si el error es un "Not Found" o algo distinto
            return res.status(200).json({ error_detail: "Respuesta: " + textData.substring(0, 50) });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Error interno: " + error.message });
    }
}
