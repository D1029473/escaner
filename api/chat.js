export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { food } = req.body;
        
        // --- TOKEN (Asegúrate de que estas partes NO tengan espacios dentro de las comillas) ---
        const t1 = "hf_"; 
        const t2 = "GTlTyNnsmLcgrIHSclQrl"; 
        const t3 = "PZaKwAvknMCav";
        
        // Esta línea elimina cualquier espacio, tabulación o salto de línea oculto
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        const response = await fetch("https://router.huggingface.co/hf-inference/models/google/gemma-2-9b-it", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Soy un experto en cocina. He detectado ${food}. Dame 3 consejos cortos y creativos para no desperdiciarlo. [/INST]`,
                parameters: { max_new_tokens: 150, temperature: 0.7 }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Esto nos dirá si el error es de permisos o de token
            return res.status(200).json({ error_detail: data.error || "Error de validación" });
        }

        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error_detail: "Fallo de conexión: " + error.message });
    }
}
