export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).json({ status: "Online" });

    try {
        const { food } = req.body || {};
        if (!food) return res.status(200).json({ error_detail: "No se recibió ingrediente" });

        // --- TU TOKEN (Usa el mismo de antes si es tipo READ) ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // Esta es la URL del Router que está funcionando para modelos pequeños como Phi-3
        const apiUrl = "https://router.huggingface.co/hf-inference/models/microsoft/Phi-3-mini-4k-instruct";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 consejos de cocina muy cortos para: ${food} [/INST]`,
                parameters: { max_new_tokens: 100 }
            }),
        });

        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            
            // Si el modelo se está cargando (común en cuentas gratuitas)
            if (jsonData.error && jsonData.error.includes("loading")) {
                return res.status(200).json({ 
                    generated_text: "La IA se está preparando (estaba dormida). Por favor, pulsa el botón de nuevo en 15 segundos." 
                });
            }

            if (!response.ok) {
                return res.status(200).json({ error_detail: jsonData.error || "Error en la ruta" });
            }

            let output = Array.isArray(jsonData) ? jsonData[0].generated_text : jsonData.generated_text;
            
            // Limpiamos la respuesta de Phi-3
            if (output.includes("[/INST]")) output = output.split("[/INST]").pop();

            return res.status(200).json({ generated_text: output.trim() });

        } catch (e) {
            // Esto nos dirá qué está respondiendo el Router si vuelve a fallar
            return res.status(200).json({ error_detail: "Respuesta del servidor: " + textData.substring(0, 50) });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Fallo servidor: " + error.message });
    }
}
