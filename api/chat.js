export default async function handler(req, res) {
    // 1. Configuración de permisos (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejo de peticiones de control
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. Si entras desde el navegador (GET), te damos un mensaje amigable
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: "Online", 
            message: "El servidor de Save and Taste está listo para recibir alimentos desde la App." 
        });
    }

    // 3. Procesar el envío de la App (POST)
    try {
        const { food } = req.body || {};
        
        if (!food) {
            return res.status(200).json({ error_detail: "No se ha enviado ningún alimento desde la cámara." });
        }

        // --- TU TOKEN (Asegúrate de que las 3 partes sean correctas) ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // Usamos la URL que el Router de Hugging Face prefiere para Mistral
        const apiUrl = "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 consejos de cocina muy cortos para aprovechar: ${food} [/INST]`,
                parameters: { max_new_tokens: 150 }
            }),
        });

        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            if (!response.ok) return res.status(200).json({ error_detail: jsonData.error || "Error en IA" });

            let output = Array.isArray(jsonData) ? jsonData[0].generated_text : jsonData.generated_text;
            if (output.includes("[/INST]")) output = output.split("[/INST]").pop().trim();

            return res.status(200).json({ generated_text: output });
        } catch (e) {
            return res.status(200).json({ error_detail: "Respuesta inesperada: " + textData.substring(0, 50) });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Error interno: " + error.message });
    }
}
