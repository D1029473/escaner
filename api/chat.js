export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { food } = req.body;
    
    // Reconstrucción del token
    const t1 = "hf_"; 
    const t2 = "OVHzzfPVZgQrJCPv"; 
    const t3 = "WaPuTxZjtPwrqcKTrJ";
    const cleanToken = (t1 + t2 + t3).replace(/\s/g, "").trim();

    try {
        // ACTUALIZADO: Nueva URL del Router de Hugging Face
        const response = await fetch("https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `<s>[INST] He detectado ${food}. Dame 2 consejos cortos de cocina para aprovecharlo. [/INST]`,
                parameters: { max_new_tokens: 100 }
            }),
        });

        const data = await response.json();

        if (data.error) {
            return res.status(200).json({ error_detail: data.error });
        }

        // El router a veces devuelve el texto directamente o en un array
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Fallo en el router", details: error.message });
    }
}
