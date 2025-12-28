export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: "Online", 
            message: "Servidor Phi-3 listo." 
        });
    }

    try {
        const { food } = req.body || {};
        if (!food) return res.status(200).json({ error_detail: "No se recibió alimento" });

        // --- TOKEN (Fragmentado) ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // URL ESPECÍFICA PARA PHI-3 (Microsoft)
        const apiUrl = "https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `<|user|>\nDame 3 consejos muy cortos en español para aprovechar o cocinar esto: ${food}<|end|>\n<|assistant|>`,
                parameters: { 
                    max_new_tokens: 150,
                    return_full_text: false
                }
            }),
        });

        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            
            // Si el modelo está cargando
            if (jsonData.error && jsonData.error.includes("loading")) {
                return res.status(200).json({ 
                    generated_text: "La IA Phi-3 se está despertando... espera 15 segundos y vuelve a pulsar el botón." 
                });
            }

            if (!response.ok) return res.status(200).json({ error_detail: jsonData.error || "Error en Phi-3" });

            // Phi-3 suele devolver el texto directamente o en un array
            let output = Array.isArray(jsonData) ? jsonData[0].generated_text : jsonData.generated_text;
            
            return res.status(200).json({ generated_text: output.trim() });

        } catch (e) {
            return res.status(200).json({ error_detail: "Respuesta inesperada de Phi-3: " + textData.substring(0, 50) });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Error de servidor: " + error.message });
    }
}
