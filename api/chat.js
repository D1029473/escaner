export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { food } = req.body;
        if (!food) return res.status(200).json({ error_detail: "No se recibió alimento" });

        // --- TOKEN (Asegúrate de que las partes no tengan espacios) ---
        const t1 = "hf_"; 
        const t2 = "xXFSCbBADUDCG"; 
        const t3 = "kLwjbmiTfzAncNMrHxlIz";
        const cleanToken = (t1 + t2 + t3).replace(/\s+/g, '').trim();

        // URL CORREGIDA: Sin "google/" y usando Mistral para asegurar compatibilidad
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
                    { role: "user", content: `Tengo ${food}. Dame 3 consejos cortos para no desperdiciarlo.` }
                ],
                max_tokens: 150
            }),
        });

        // Verificamos si la respuesta es texto plano (como el "Not Found") antes de convertir a JSON
        const textData = await response.text();
        
        try {
            const jsonData = JSON.parse(textData);
            if (!response.ok) {
                return res.status(200).json({ error_detail: jsonData.error || "Error en API" });
            }
            // El formato de chat completions devuelve la respuesta en choices
            const aiMessage = jsonData.choices[0].message.content;
            return res.status(200).json({ generated_text: aiMessage });
        } catch (e) {
            return res.status(200).json({ error_detail: "La API respondió algo no válido: " + textData });
        }

    } catch (error) {
        return res.status(500).json({ error_detail: "Error en el servidor: " + error.message });
    }
}
