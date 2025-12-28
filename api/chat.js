export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Si alguien entra por URL directa (GET), le damos un mensaje de éxito
    if (req.method !== 'POST') {
        return res.status(200).json({ mensaje: "Servidor Save and Taste activo. Esperando datos POST." });
    }

    try {
        const { food } = req.body;
        if (!food) return res.status(400).json({ error_detail: "No se detectó alimento" });

        // --- TOKEN (Asegúrate de que no haya espacios en las partes) ---
        const t1 = "hf_"; 
        const t2 = "GTlTyNnsmLcgrIHSclQrl"; 
        const t3 = "PZaKwAvknMCav";
        const cleanToken = (t1 + t2 + t3).trim();

        const response = await fetch("https://router.huggingface.co/hf-inference/models/google/gemma-2-9b-it", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `[INST] Dame 3 consejos cortos para aprovechar: ${food} [/INST]`,
                parameters: { max_new_tokens: 150 }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(200).json({ error_detail: data.error || "Error en Hugging Face" });
        }

        return res.status(200).json(data);

    } catch (error) {
        // Este es el error que veías antes. Ahora imprimirá el motivo en los logs de Vercel.
        console.error("LOG DE ERROR:", error.message);
        return res.status(500).json({ error_detail: "Error interno: " + error.message });
    }
}
