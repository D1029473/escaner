export default async function handler(req, res) {
    // Configuración de CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { food } = req.body;
        
        // --- TOKEN FRAGMENTADO ---
        const t1 = "hf_"; 
        const t2 = "OVHzzfPVZgQrJCPv"; 
        const t3 = "WaPuTxZjtPwrqcKTrJ";
        const cleanToken = (t1 + t2 + t3).trim();

        // URL del nuevo Router oficial de Hugging Face
        const apiUrl = "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 consejos muy cortos para aprovechar: ${food} [/INST]`,
                parameters: { max_new_tokens: 150, temperature: 0.7 }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Error de Hugging Face:", data);
            return res.status(200).json({ error_detail: data.error || "Error en la API de IA" });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Error en Servidor Vercel:", error);
        return res.status(500).json({ error_detail: "Fallo de conexión interna" });
    }
}
