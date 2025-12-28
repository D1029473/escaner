export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { food } = req.body;
    
    // --- REVISA BIEN ESTA PARTE ---
    const t1 = "hf_"; 
    const t2 = "OVHzzfPVZgQrJCPv"; // Asegúrate de que no haya espacios
    const t3 = "WaPuTxZjtPwrqcKTrJ";
    
    const cleanToken = (t1 + t2 + t3).replace(/\s/g, "").trim();

    try {
        const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: `<s>[INST] Dame 2 tips de cocina para aprovechar: ${food} [/INST]`,
                options: { wait_for_model: true } // Esto obliga a esperar si el modelo está cargando
            }),
        });

        const data = await response.json();

        if (data.error) {
            // Si Hugging Face nos da un error, lo enviamos a la pantalla
            return res.status(200).json({ error_detail: data.error });
        }

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Fallo de red", details: error.message });
    }
}
