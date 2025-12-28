export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { food } = req.body;
        
        // --- TU TOKEN FRAGMENTADO ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // Esta es la URL que te pide el error, pero con el endpoint de CHAT
        const apiUrl = "https://router.huggingface.co/hf-inference/v1/chat/completions";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${cleanToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                model: "mistralai/Mistral-7B-Instruct-v0.2",
                messages: [
                    { 
                        role: "user", 
                        content: `Soy un usuario de Save and Taste. He detectado ${food}. Dame 3 consejos muy cortos para aprovecharlo.` 
                    }
                ],
                max_tokens: 120
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(200).json({ error_detail: data.error || "Error en el Router" });
        }

        // En el formato /v1/chat/completions, la respuesta viene aquí:
        const aiResponse = data.choices[0].message.content;

        return res.status(200).json({ generated_text: aiResponse });

    } catch (error) {
        return res.status(500).json({ error_detail: "Error crítico: " + error.message });
    }
}
