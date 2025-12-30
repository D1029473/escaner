export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Manejar preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Health check
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            message: 'Save & Taste API',
            mode: 'simple',
            timestamp: new Date().toISOString()
        });
    }
    
    // Solo aceptar POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }
    
    try {
        const { food, option = 'conservation' } = req.body || {};
        
        if (!food) {
            return res.status(400).json({ error: 'Se requiere un alimento' });
        }
        
        // Respuestas predefinidas para probar
        const conservationTips = {
            "manzana": ["Guardar en refrigerador", "No lavar hasta consumir", "Separar de otras frutas"],
            "platano": ["Temperatura ambiente", "Alejar de otras frutas", "Congelar si madura"],
            "pan": ["Bolsa de tela", "Congelar rebanado", "Tostar para revivir"],
            "lechuga": ["Lavar y secar bien", "Papel absorbente", "Consumir en 3 días"],
            "tomate": ["No refrigerar", "Temperatura ambiente", "Alejado del sol"]
        };
        
        const recipes = {
            "manzana": ["Ensalada con yogur", "Compota con canela", "Tarta rápida"],
            "platano": ["Batido con leche", "Pan de plátano", "Helado natural"],
            "pan": ["Pudín de pan", "Tostadas francesas", "Croutons para sopa"],
            "lechuga": ["Ensalada básica", "Wrap con pollo", "Sopa ligera"],
            "tomate": ["Sopa fría", "Salsa rápida", "Ensalada caprese"]
        };
        
        let response;
        
        if (option === 'conservation') {
            const tips = conservationTips[food.toLowerCase()] || [
                "Guardar en lugar fresco",
                "Consumir pronto",
                "Verificar estado"
            ];
            response = `Consejos para ${food}:\n1. ${tips[0]}\n2. ${tips[1]}\n3. ${tips[2]}`;
        } else {
            const recs = recipes[food.toLowerCase()] || [
                "Saltear con aceite",
                "Añadir especias",
                "Servir caliente"
            ];
            response = `Recetas con ${food}:\n1. ${recs[0]}\n2. ${recs[1]}\n3. ${recs[2]}`;
        }
        
        return res.status(200).json({
            generated_text: response,
            food: food,
            option: option,
            success: true,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error en API:', error);
        return res.status(500).json({
            error: 'Error interno',
            message: 'Por favor, intenta de nuevo'
        });
    }
}
