import fetch from 'node-fetch';

const responseCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

// Función para analizar si un alimento está en mal estado basado en su nombre y características
function analyzeFoodSpoilage(foodName, foodType = 'unknown') {
    const spoiledIndicators = {
        'frutas': ['mohosa', 'parda', 'arrugada', 'blanda', 'líquida', 'fermentada', 'oscura'],
        'verduras': ['marchita', 'amarilla', 'babosa', 'podrida', 'seca', 'negra'],
        'carnes': ['grisácea', 'viscosa', 'olor fuerte', 'mucosa', 'seca', 'descolorida'],
        'pescados': ['opaca', 'ojos hundidos', 'agallas grises', 'olor amoniaco', 'blanda'],
        'lacteos': ['grumosa', 'olor agrio', 'separada', 'color amarillento', 'mohosa'],
        'pan': ['mohoso', 'duro', 'seco', 'manchas verdes', 'olor rancio']
    };
    
    // Determinar tipo de alimento
    let foodCategory = 'general';
    const foodLower = foodName.toLowerCase();
    
    if (foodLower.includes('manzana') || foodLower.includes('platano') || foodLower.includes('naranja') || 
        foodLower.includes('fresa') || foodLower.includes('uva') || foodLower.includes('pera')) {
        foodCategory = 'frutas';
    } else if (foodLower.includes('lechuga') || foodLower.includes('tomate') || foodLower.includes('zanahoria') || 
               foodLower.includes('cebolla') || foodLower.includes('pimiento')) {
        foodCategory = 'verduras';
    } else if (foodLower.includes('pollo') || foodLower.includes('carne') || foodLower.includes('cerdo')) {
        foodCategory = 'carnes';
    } else if (foodLower.includes('pescado') || foodLower.includes('atún') || foodLower.includes('salmón')) {
        foodCategory = 'pescados';
    } else if (foodLower.includes('leche') || foodLower.includes('queso') || foodLower.includes('yogur')) {
        foodCategory = 'lacteos';
    } else if (foodLower.includes('pan') || foodLower.includes('tostada')) {
        foodCategory = 'pan';
    }
    
    return {
        category: foodCategory,
        indicators: spoiledIndicators[foodCategory] || spoiledIndicators.frutas,
        likelyToSpoil: ['frutas', 'verduras', 'pescados'].includes(foodCategory)
    };
}

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Health check
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            service: 'Save & Taste AI API',
            version: '2.2.0',
            features: ['IA Hugging Face', 'Análisis de frescura', 'Consejos personalizados'],
            timestamp: new Date().toISOString()
        });
    }
    
    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }
    
    try {
        const { food, option = 'conservation', imageData = null, isSpoiled = false } = req.body || {};
        
        if (!food) {
            return res.status(400).json({ 
                error: 'Se requiere un alimento',
                message: 'Envía el nombre del alimento escaneado'
            });
        }
        
        const cleanFood = food.trim();
        const cacheKey = `${cleanFood}_${option}_${isSpoiled}`;
        
        // Verificar cache
        const cached = responseCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return res.status(200).json({
                ...cached.data,
                cached: true,
                cached_at: new Date(cached.timestamp).toISOString()
            });
        }
        
        // Análisis de probabilidad de deterioro
        const spoilageAnalysis = analyzeFoodSpoilage(cleanFood);
        const likelyToSpoil = spoilageAnalysis.likelyToSpoil;
        
        // Token de Hugging Face
        const HF_TOKEN = process.env.HF_TOKEN;
        
        // Determinar qué modelo usar
        const model = "HuggingFaceH4/zephyr-7b-beta"; // Modelo estable y rápido
        
        // Construir prompt basado en opción y estado
        let prompt;
        const now = new Date();
        
        if (option === 'conservation') {
            if (isSpoiled) {
                prompt = `Como experto en seguridad alimentaria, responde sobre ${cleanFood} que está EN MAL ESTADO.
                
Proporciona:
1. 3 señales claras de que NO debe consumirse (basado en su categoría: ${spoilageAnalysis.category})
2. 2 consejos para evitar que se eche a perder en el futuro
3. 1 método seguro para desecharlo
4. Tiempo estimado que dura en buen estado este tipo de alimento

Formato: lista numerada, español claro, sin introducción.`;
            } else {
                prompt = `Como experto en conservación de alimentos, da consejos para ${cleanFood} (categoría: ${spoilageAnalysis.category}).
                
Proporciona EXACTAMENTE:
1. Cómo almacenarlo correctamente (lugar, temperatura, envase)
2. Tiempo aproximado de conservación en refrigerador y a temperatura ambiente
3. Señales tempranas de deterioro a observar
4. Un tip especial para prolongar su frescura

Formato: 1. [consejo] 2. [consejo] etc. Español práctico.`;
            }
        } else { // recipes
            if (isSpoiled) {
                prompt = `ADVERTENCIA: ${cleanFood} está en mal estado. NO debe consumirse.

Como nutricionista, sugiere:
1. 2 alternativas saludables que pueden reemplazar este ${cleanFood}
2. 1 receta completa que NO use este ingrediente
3. Consejos para seleccionar y almacenar correctamente en la próxima compra

Enfocado en seguridad alimentaria y nutrición. Español.`;
            } else {
                prompt = `Como chef profesional, crea 2 recetas deliciosas y saludables usando ${cleanFood}.

Para CADA receta (formato claro):
🍽️ Nombre atractivo
📝 4-6 ingredientes principales (comunes)
👨‍🍳 3 pasos de preparación (claros)
⏱️ Tiempo total estimado
💡 Un tip especial para mejorarla

Requisitos: recetas realistas, ingredientes accesibles, preparación < 45 min. Español.`;
            }
        }
        
        // Si no hay token de HF, usar respuesta predefinida mejorada
        if (!HF_TOKEN) {
            console.log('Usando respuestas predefinidas (sin HF_TOKEN)');
            return getEnhancedFallbackResponse(cleanFood, option, isSpoiled, spoilageAnalysis, res);
        }
        
        // Llamar a Hugging Face API
        try {
            const response = await fetch(
                `https://api-inference.huggingface.co/models/${model}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${HF_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        inputs: prompt,
                        parameters: {
                            max_new_tokens: 350,
                            temperature: 0.7,
                            top_p: 0.9,
                            repetition_penalty: 1.1,
                            return_full_text: false
                        },
                        options: {
                            use_cache: true,
                            wait_for_model: false
                        }
                    }),
                    signal: AbortSignal.timeout(20000) // 20 segundos timeout
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const data = await response.json();
            
            // Procesar respuesta
            let generatedText = '';
            
            if (Array.isArray(data) && data[0]?.generated_text) {
                generatedText = data[0].generated_text;
            } else if (data.generated_text) {
                generatedText = data.generated_text;
            } else {
                throw new Error('Formato de respuesta inesperado');
            }
            
            // Limpiar y mejorar la respuesta
            generatedText = cleanAIResponse(generatedText, cleanFood, isSpoiled);
            
            const responseData = {
                generated_text: generatedText,
                food: cleanFood,
                option: option,
                is_spoiled: isSpoiled,
                food_category: spoilageAnalysis.category,
                likely_to_spoil: likelyToSpoil,
                ai_generated: true,
                model_used: model,
                success: true,
                timestamp: new Date().toISOString()
            };
            
            // Guardar en cache
            responseCache.set(cacheKey, {
                data: responseData,
                timestamp: Date.now()
            });
            
            // Limpiar cache antiguo
            cleanupCache();
            
            return res.status(200).json(responseData);
            
        } catch (aiError) {
            console.error('Error con Hugging Face:', aiError.message);
            // Fallback a respuestas mejoradas
            return getEnhancedFallbackResponse(cleanFood, option, isSpoiled, spoilageAnalysis, res);
        }
        
    } catch (error) {
        console.error('Error general en API:', error);
        return res.status(500).json({
            error: 'Error interno',
            message: 'Por favor, intenta de nuevo en unos momentos',
            fallback: true
        });
    }
}

// Limpiar cache antiguo
function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of responseCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}

// Limpiar respuesta de IA
function cleanAIResponse(text, food, isSpoiled) {
    let cleaned = text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    
    // Remover frases de relleno comunes
    const fillerPhrases = [
        'Por supuesto, aquí tienes',
        'Claro, aquí está',
        'Como experto en',
        'Voy a proporcionarte',
        'Te voy a dar',
        'A continuación',
        'En cuanto a'
    ];
    
    fillerPhrases.forEach(phrase => {
        if (cleaned.startsWith(phrase)) {
            cleaned = cleaned.substring(phrase.length).trim();
        }
    });
    
    // Añadir advertencia si está en mal estado
    if (isSpoiled) {
        const warning = `⚠️ **¡ALTO! ESTE ${food.toUpperCase()} ESTÁ EN MAL ESTADO** ⚠️\n\n`;
        const danger = `**NO CONSUMAS. PUEDE CAUSAR:**\n• Intoxicación alimentaria\n• Vómitos y diarrea\n• Fiebre y malestar\n• Problemas graves en grupos de riesgo\n\n`;
        cleaned = warning + danger + cleaned;
    }
    
    return cleaned;
}

// Respuestas de fallback mejoradas
function getEnhancedFallbackResponse(food, option, isSpoiled, spoilageAnalysis, res) {
    const foodLower = food.toLowerCase();
    const category = spoilageAnalysis.category;
    
    let responseText = '';
    
    // ADVERTENCIA CRÍTICA si está en mal estado
    if (isSpoiled) {
        responseText = `🚨 **¡PELIGRO! ${food.toUpperCase()} EN MAL ESTADO** 🚨\n\n`;
        responseText += `**NO CONSUMAS BAJO NINGUNA CIRCUNSTANCIA**\n\n`;
        responseText += `🔴 **SEÑALES VISIBLES DE DETERIORO:**\n`;
        
        spoilageAnalysis.indicators.forEach((indicator, i) => {
            responseText += `• ${indicator}\n`;
        });
        
        responseText += `\n🛡️ **ACCIÓN INMEDIATA REQUERIDA:**\n`;
        responseText += `1. 🔥 Desechar inmediatamente\n`;
        responseText += `2. 🧼 Limpiar área de contacto\n`;
        responseText += `3. 👃 Verificar alimentos cercanos\n`;
        responseText += `4. 🗑️ Usar bolsa cerrada para basura\n\n`;
        
        responseText += `🏥 **SI CONSUMISTE ACCIDENTALMENTE:**\n`;
        responseText += `• 💧 Beber mucha agua\n`;
        responseText += `• 👨‍⚕️ Contactar médico si síntomas\n`;
        responseText += `• 📞 Centro toxicológico: 915 620 420\n\n`;
        
        responseText += `🔮 **PARA EVITAR EN EL FUTURO:**\n`;
        
        if (category === 'frutas') {
            responseText += `• Comprar en pequeñas cantidades\n`;
            responseText += `• Almacenar en refrigerador\n`;
            responseText += `• Separar frutas maduras de verdes\n`;
        } else if (category === 'carnes') {
            responseText += `• Congelar si no se consume en 2 días\n`;
            responseText += `• Usar envases herméticos\n`;
            responseText += `• Mantener cadena de frío\n`;
        }
        
        responseText += `\n📅 **VIDA ÚTIL TÍPICA:** ${getShelfLife(foodLower, category)}\n`;
    }
    
    // Contenido principal según opción
    if (option === 'conservation') {
        if (!isSpoiled) {
            responseText += `🥦 **GUÍA DE CONSERVACIÓN: ${food.toUpperCase()}** 🥦\n\n`;
            responseText += `📌 **CATEGORÍA:** ${category.toUpperCase()}\n\n`;
            
            const conservationData = getConservationData(foodLower, category);
            responseText += conservationData;
            
            responseText += `\n👁️ **SEÑALES DE DETERIORO:**\n`;
            spoilageAnalysis.indicators.forEach((indicator, i) => {
                if (i < 4) responseText += `${i+1}. ${indicator}\n`;
            });
            
            responseText += `\n💡 **TIP ESPECIAL:** ${getSpecialTip(foodLower, category)}`;
        }
    } else { // recipes
        if (!isSpoiled) {
            responseText += `🍳 **RECETAS CON ${food.toUpperCase()}** 🍳\n\n`;
            
            const recipes = getRecipes(foodLower, category);
            responseText += recipes;
        } else {
            responseText += `\n🍽️ **ALTERNATIVAS SEGURAS:**\n\n`;
            responseText += `1. 🥦 **Sustituir por:** ${getAlternative(foodLower, category)}\n\n`;
            responseText += `2. 📋 **Receta alternativa sugerida:**\n`;
            responseText += getAlternativeRecipe(foodLower, category);
        }
    }
    
    return res.status(200).json({
        generated_text: responseText,
        food: food,
        option: option,
        is_spoiled: isSpoiled,
        food_category: category,
        ai_generated: false,
        fallback: true,
        success: true,
        timestamp: new Date().toISOString()
    });
}

// Datos de conservación por categoría
function getConservationData(food, category) {
    const data = {
        'frutas': `🌡️ **Temperatura ideal:** 4-8°C (refrigerador)\n🗓️ **Duración típica:** 3-7 días\n📦 **Envase ideal:** Bolsa perforada en cajón de frutas\n🚫 **Evitar:** Lavar antes de guardar\n`,
        'verduras': `🌡️ **Temperatura ideal:** 4-10°C\n🗓️ **Duración típica:** 5-10 días\n📦 **Envase ideal:** Bolsa de plástico con agujeros\n💧 **Humedad:** Alta (90-95%)\n`,
        'carnes': `🌡️ **Temperatura ideal:** 0-4°C\n🗓️ **Duración típica:** 1-2 días (cruda)\n📦 **Envase ideal:** Envase hermético en parte fría\n❄️ **Congelación:** -18°C por 3-6 meses\n`,
        'pescados': `🌡️ **Temperatura ideal:** 0-2°C\n🗓️ **Duración típica:** 1 día máximo\n📦 **Envase ideal:** Sobre hielo en recipiente\n👃 **Prueba de frescura:** Olor a mar fresco\n`,
        'lacteos': `🌡️ **Temperatura ideal:** 4-6°C\n🗓️ **Duración típica:** Consultar fecha\n📦 **Envase ideal:** Original cerrado\n🚫 **Evitar:** Temperatura ambiente >2h\n`,
        'pan': `🌡️ **Temperatura ideal:** Ambiente seco\n🗓️ **Duración típica:** 2-3 días\n📦 **Envase ideal:** Bolsa de tela\n❄️ **Congelación:** Rebanado por 3 meses\n`
    };
    
    return data[category] || `🌡️ **Almacenar en lugar fresco y seco**\n🗓️ **Consumir preferentemente en 3-5 días**\n📦 **Mantener en envase original cerrado**`;
}

function getShelfLife(food, category) {
    const shelfLife = {
        'frutas': '3-7 días refrigeradas',
        'verduras': '5-10 días refrigeradas',
        'carnes': '1-2 días refrigeradas, 3-6 meses congeladas',
        'pescados': '1 día refrigerado, 2-3 meses congelado',
        'lacteos': 'Consultar fecha de caducidad',
        'pan': '2-3 días a temperatura ambiente',
        'general': '3-5 días en condiciones adecuadas'
    };
    
    return shelfLife[category] || shelfLife.general;
}

function getSpecialTip(food, category) {
    const tips = {
        'frutas': 'Colocar una manzana madura junto a frutas verdes para acelerar su maduración de forma natural.',
        'verduras': 'Guardar con un paño de cocina absorbente para evitar la humedad excesiva.',
        'carnes': 'Congelar en porciones individuales para descongelar solo lo necesario.',
        'pescados': 'Colocar sobre un lecho de hielo en un recipiente con rejilla para que no esté en contacto directo con el agua.',
        'lacteos': 'Guardar en la parte menos fría del refrigerador (estantes superiores).',
        'pan': 'Congelar rebanado para poder tostar directamente sin necesidad de descongelar.',
        'general': 'Rotar los alimentos: colocar los más nuevos atrás y los que deben consumirse pronto delante.'
    };
    
    return tips[category] || tips.general;
}

function getRecipes(food, category) {
    const recipeTemplates = {
        'frutas': `🍎 **BATIDO ENERGÉTICO**\n📝 Ingredientes: 1 taza de ${food}, 1 plátano, 1 taza leche, miel\n👨‍🍳 Preparación: 1. Licuar todo 2. Servir frío 3. Decorar\n⏱️ Tiempo: 5 minutos\n\n🥗 **ENSALADA DE FRUTAS**\n📝 Ingredientes: ${food}, otras frutas, yogur, nueces\n👨‍🍳 Preparación: 1. Cortar frutas 2. Mezclar con yogur 3. Añadir nueces\n⏱️ Tiempo: 10 minutos`,
        'verduras': `🥬 **SALTEADO SALUDABLE**\n📝 Ingredientes: ${food}, ajo, aceite oliva, sal\n👨‍🍳 Preparación: 1. Cortar 2. Saltear 3. Condimentar\n⏱️ Tiempo: 15 minutos\n\n🥣 **CREMA DE ${food.toUpperCase()}**\n📝 Ingredientes: ${food}, cebolla, patata, caldo\n👨‍🍳 Preparación: 1. Cocinar 2. Triturar 3. Ajustar espesor\n⏱️ Tiempo: 30 minutos`,
        'carnes': `🍖 **${food.toUpperCase()} AL HORNO**\n📝 Ingredientes: ${food}, especias, aceite, limón\n👨‍🍳 Preparación: 1. Marinar 2. Hornear 3. Reposar\n⏱️ Tiempo: 40 minutos\n\n🍲 **GUISO TRADICIONAL**\n📝 Ingredientes: ${food}, verduras, vino, hierbas\n👨‍🍳 Preparación: 1. Dorar 2. Añadir líquido 3. Cocinar a fuego lento\n⏱️ Tiempo: 60 minutos`,
        'general': `🍽️ **RECETA RÁPIDA CON ${food.toUpperCase()}**\n📝 Ingredientes: ${food}, aceite, ajo, sal, especias\n👨‍🍳 Preparación: 1. Preparar ingredientes 2. Cocinar 3. Servir\n⏱️ Tiempo: 20 minutos\n\n🥘 **PREPARACIÓN BÁSICA**\n📝 Ingredientes: ${food}, cebolla, tomate, hierbas\n👨‍🍳 Preparación: 1. Sofreír 2. Cocinar 3. Añadir toque final\n⏱️ Tiempo: 25 minutos`
    };
    
    return recipeTemplates[category] || recipeTemplates.general;
}

function getAlternative(food, category) {
    const alternatives = {
        'frutas': 'Otra fruta fresca de temporada',
        'verduras': 'Otra verdura similar fresca',
        'carnes': 'Carne fresca o proteína vegetal (lentejas, garbanzos)',
        'pescados': 'Pescado fresco o conservas de pescado en buen estado',
        'lacteos': 'Productos lácteos frescos no abiertos',
        'pan': 'Pan fresco del día o pan congelado',
        'general': 'Un ingrediente fresco similar'
    };
    
    return alternatives[category] || alternatives.general;
}

function getAlternativeRecipe(food, category) {
    const alternatives = {
        'frutas': `🥤 **SMOOTHIE VERDE**\n📝 Espinaca, plátano, manzana, agua\n👨‍🍳 Licuar todo y servir\n⏱️ 5 minutos`,
        'verduras': `🥦 **SALTEADO DE BRÓCOLI**\n📝 Brócoli, ajo, salsa de soja, aceite\n👨‍🍳 Saltear rápidamente\n⏱️ 10 minutos`,
        'carnes': `🍗 **POLLO A LA PLANCHA**\n📝 Pechuga de pollo, limón, especias\n👨‍🍳 Marinar y cocinar\n⏱️ 20 minutos`,
        'general': `🍚 **ARROZ FRITO VEGETARIANO**\n📝 Arroz, huevo, verduras, soja\n👨‍🍳 Saltear todo junto\n⏱️ 15 minutos`
    };
    
    return alternatives[category] || alternatives.general;
}import fetch from 'node-fetch';

const responseCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

// Función para analizar si un alimento está en mal estado basado en su nombre y características
function analyzeFoodSpoilage(foodName, foodType = 'unknown') {
    const spoiledIndicators = {
        'frutas': ['mohosa', 'parda', 'arrugada', 'blanda', 'líquida', 'fermentada', 'oscura'],
        'verduras': ['marchita', 'amarilla', 'babosa', 'podrida', 'seca', 'negra'],
        'carnes': ['grisácea', 'viscosa', 'olor fuerte', 'mucosa', 'seca', 'descolorida'],
        'pescados': ['opaca', 'ojos hundidos', 'agallas grises', 'olor amoniaco', 'blanda'],
        'lacteos': ['grumosa', 'olor agrio', 'separada', 'color amarillento', 'mohosa'],
        'pan': ['mohoso', 'duro', 'seco', 'manchas verdes', 'olor rancio']
    };
    
    // Determinar tipo de alimento
    let foodCategory = 'general';
    const foodLower = foodName.toLowerCase();
    
    if (foodLower.includes('manzana') || foodLower.includes('platano') || foodLower.includes('naranja') || 
        foodLower.includes('fresa') || foodLower.includes('uva') || foodLower.includes('pera')) {
        foodCategory = 'frutas';
    } else if (foodLower.includes('lechuga') || foodLower.includes('tomate') || foodLower.includes('zanahoria') || 
               foodLower.includes('cebolla') || foodLower.includes('pimiento')) {
        foodCategory = 'verduras';
    } else if (foodLower.includes('pollo') || foodLower.includes('carne') || foodLower.includes('cerdo')) {
        foodCategory = 'carnes';
    } else if (foodLower.includes('pescado') || foodLower.includes('atún') || foodLower.includes('salmón')) {
        foodCategory = 'pescados';
    } else if (foodLower.includes('leche') || foodLower.includes('queso') || foodLower.includes('yogur')) {
        foodCategory = 'lacteos';
    } else if (foodLower.includes('pan') || foodLower.includes('tostada')) {
        foodCategory = 'pan';
    }
    
    return {
        category: foodCategory,
        indicators: spoiledIndicators[foodCategory] || spoiledIndicators.frutas,
        likelyToSpoil: ['frutas', 'verduras', 'pescados'].includes(foodCategory)
    };
}

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Health check
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            service: 'Save & Taste AI API',
            version: '2.2.0',
            features: ['IA Hugging Face', 'Análisis de frescura', 'Consejos personalizados'],
            timestamp: new Date().toISOString()
        });
    }
    
    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }
    
    try {
        const { food, option = 'conservation', imageData = null, isSpoiled = false } = req.body || {};
        
        if (!food) {
            return res.status(400).json({ 
                error: 'Se requiere un alimento',
                message: 'Envía el nombre del alimento escaneado'
            });
        }
        
        const cleanFood = food.trim();
        const cacheKey = `${cleanFood}_${option}_${isSpoiled}`;
        
        // Verificar cache
        const cached = responseCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return res.status(200).json({
                ...cached.data,
                cached: true,
                cached_at: new Date(cached.timestamp).toISOString()
            });
        }
        
        // Análisis de probabilidad de deterioro
        const spoilageAnalysis = analyzeFoodSpoilage(cleanFood);
        const likelyToSpoil = spoilageAnalysis.likelyToSpoil;
        
        // Token de Hugging Face
        const HF_TOKEN = process.env.HF_TOKEN;
        
        // Determinar qué modelo usar
        const model = "HuggingFaceH4/zephyr-7b-beta"; // Modelo estable y rápido
        
        // Construir prompt basado en opción y estado
        let prompt;
        const now = new Date();
        
        if (option === 'conservation') {
            if (isSpoiled) {
                prompt = `Como experto en seguridad alimentaria, responde sobre ${cleanFood} que está EN MAL ESTADO.
                
Proporciona:
1. 3 señales claras de que NO debe consumirse (basado en su categoría: ${spoilageAnalysis.category})
2. 2 consejos para evitar que se eche a perder en el futuro
3. 1 método seguro para desecharlo
4. Tiempo estimado que dura en buen estado este tipo de alimento

Formato: lista numerada, español claro, sin introducción.`;
            } else {
                prompt = `Como experto en conservación de alimentos, da consejos para ${cleanFood} (categoría: ${spoilageAnalysis.category}).
                
Proporciona EXACTAMENTE:
1. Cómo almacenarlo correctamente (lugar, temperatura, envase)
2. Tiempo aproximado de conservación en refrigerador y a temperatura ambiente
3. Señales tempranas de deterioro a observar
4. Un tip especial para prolongar su frescura

Formato: 1. [consejo] 2. [consejo] etc. Español práctico.`;
            }
        } else { // recipes
            if (isSpoiled) {
                prompt = `ADVERTENCIA: ${cleanFood} está en mal estado. NO debe consumirse.

Como nutricionista, sugiere:
1. 2 alternativas saludables que pueden reemplazar este ${cleanFood}
2. 1 receta completa que NO use este ingrediente
3. Consejos para seleccionar y almacenar correctamente en la próxima compra

Enfocado en seguridad alimentaria y nutrición. Español.`;
            } else {
                prompt = `Como chef profesional, crea 2 recetas deliciosas y saludables usando ${cleanFood}.

Para CADA receta (formato claro):
🍽️ Nombre atractivo
📝 4-6 ingredientes principales (comunes)
👨‍🍳 3 pasos de preparación (claros)
⏱️ Tiempo total estimado
💡 Un tip especial para mejorarla

Requisitos: recetas realistas, ingredientes accesibles, preparación < 45 min. Español.`;
            }
        }
        
        // Si no hay token de HF, usar respuesta predefinida mejorada
        if (!HF_TOKEN) {
            console.log('Usando respuestas predefinidas (sin HF_TOKEN)');
            return getEnhancedFallbackResponse(cleanFood, option, isSpoiled, spoilageAnalysis, res);
        }
        
        // Llamar a Hugging Face API
        try {
            const response = await fetch(
                `https://api-inference.huggingface.co/models/${model}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${HF_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        inputs: prompt,
                        parameters: {
                            max_new_tokens: 350,
                            temperature: 0.7,
                            top_p: 0.9,
                            repetition_penalty: 1.1,
                            return_full_text: false
                        },
                        options: {
                            use_cache: true,
                            wait_for_model: false
                        }
                    }),
                    signal: AbortSignal.timeout(20000) // 20 segundos timeout
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const data = await response.json();
            
            // Procesar respuesta
            let generatedText = '';
            
            if (Array.isArray(data) && data[0]?.generated_text) {
                generatedText = data[0].generated_text;
            } else if (data.generated_text) {
                generatedText = data.generated_text;
            } else {
                throw new Error('Formato de respuesta inesperado');
            }
            
            // Limpiar y mejorar la respuesta
            generatedText = cleanAIResponse(generatedText, cleanFood, isSpoiled);
            
            const responseData = {
                generated_text: generatedText,
                food: cleanFood,
                option: option,
                is_spoiled: isSpoiled,
                food_category: spoilageAnalysis.category,
                likely_to_spoil: likelyToSpoil,
                ai_generated: true,
                model_used: model,
                success: true,
                timestamp: new Date().toISOString()
            };
            
            // Guardar en cache
            responseCache.set(cacheKey, {
                data: responseData,
                timestamp: Date.now()
            });
            
            // Limpiar cache antiguo
            cleanupCache();
            
            return res.status(200).json(responseData);
            
        } catch (aiError) {
            console.error('Error con Hugging Face:', aiError.message);
            // Fallback a respuestas mejoradas
            return getEnhancedFallbackResponse(cleanFood, option, isSpoiled, spoilageAnalysis, res);
        }
        
    } catch (error) {
        console.error('Error general en API:', error);
        return res.status(500).json({
            error: 'Error interno',
            message: 'Por favor, intenta de nuevo en unos momentos',
            fallback: true
        });
    }
}

// Limpiar cache antiguo
function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of responseCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}

// Limpiar respuesta de IA
function cleanAIResponse(text, food, isSpoiled) {
    let cleaned = text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    
    // Remover frases de relleno comunes
    const fillerPhrases = [
        'Por supuesto, aquí tienes',
        'Claro, aquí está',
        'Como experto en',
        'Voy a proporcionarte',
        'Te voy a dar',
        'A continuación',
        'En cuanto a'
    ];
    
    fillerPhrases.forEach(phrase => {
        if (cleaned.startsWith(phrase)) {
            cleaned = cleaned.substring(phrase.length).trim();
        }
    });
    
    // Añadir advertencia si está en mal estado
    if (isSpoiled) {
        const warning = `⚠️ **¡ALTO! ESTE ${food.toUpperCase()} ESTÁ EN MAL ESTADO** ⚠️\n\n`;
        const danger = `**NO CONSUMAS. PUEDE CAUSAR:**\n• Intoxicación alimentaria\n• Vómitos y diarrea\n• Fiebre y malestar\n• Problemas graves en grupos de riesgo\n\n`;
        cleaned = warning + danger + cleaned;
    }
    
    return cleaned;
}

// Respuestas de fallback mejoradas
function getEnhancedFallbackResponse(food, option, isSpoiled, spoilageAnalysis, res) {
    const foodLower = food.toLowerCase();
    const category = spoilageAnalysis.category;
    
    let responseText = '';
    
    // ADVERTENCIA CRÍTICA si está en mal estado
    if (isSpoiled) {
        responseText = `🚨 **¡PELIGRO! ${food.toUpperCase()} EN MAL ESTADO** 🚨\n\n`;
        responseText += `**NO CONSUMAS BAJO NINGUNA CIRCUNSTANCIA**\n\n`;
        responseText += `🔴 **SEÑALES VISIBLES DE DETERIORO:**\n`;
        
        spoilageAnalysis.indicators.forEach((indicator, i) => {
            responseText += `• ${indicator}\n`;
        });
        
        responseText += `\n🛡️ **ACCIÓN INMEDIATA REQUERIDA:**\n`;
        responseText += `1. 🔥 Desechar inmediatamente\n`;
        responseText += `2. 🧼 Limpiar área de contacto\n`;
        responseText += `3. 👃 Verificar alimentos cercanos\n`;
        responseText += `4. 🗑️ Usar bolsa cerrada para basura\n\n`;
        
        responseText += `🏥 **SI CONSUMISTE ACCIDENTALMENTE:**\n`;
        responseText += `• 💧 Beber mucha agua\n`;
        responseText += `• 👨‍⚕️ Contactar médico si síntomas\n`;
        responseText += `• 📞 Centro toxicológico: 915 620 420\n\n`;
        
        responseText += `🔮 **PARA EVITAR EN EL FUTURO:**\n`;
        
        if (category === 'frutas') {
            responseText += `• Comprar en pequeñas cantidades\n`;
            responseText += `• Almacenar en refrigerador\n`;
            responseText += `• Separar frutas maduras de verdes\n`;
        } else if (category === 'carnes') {
            responseText += `• Congelar si no se consume en 2 días\n`;
            responseText += `• Usar envases herméticos\n`;
            responseText += `• Mantener cadena de frío\n`;
        }
        
        responseText += `\n📅 **VIDA ÚTIL TÍPICA:** ${getShelfLife(foodLower, category)}\n`;
    }
    
    // Contenido principal según opción
    if (option === 'conservation') {
        if (!isSpoiled) {
            responseText += `🥦 **GUÍA DE CONSERVACIÓN: ${food.toUpperCase()}** 🥦\n\n`;
            responseText += `📌 **CATEGORÍA:** ${category.toUpperCase()}\n\n`;
            
            const conservationData = getConservationData(foodLower, category);
            responseText += conservationData;
            
            responseText += `\n👁️ **SEÑALES DE DETERIORO:**\n`;
            spoilageAnalysis.indicators.forEach((indicator, i) => {
                if (i < 4) responseText += `${i+1}. ${indicator}\n`;
            });
            
            responseText += `\n💡 **TIP ESPECIAL:** ${getSpecialTip(foodLower, category)}`;
        }
    } else { // recipes
        if (!isSpoiled) {
            responseText += `🍳 **RECETAS CON ${food.toUpperCase()}** 🍳\n\n`;
            
            const recipes = getRecipes(foodLower, category);
            responseText += recipes;
        } else {
            responseText += `\n🍽️ **ALTERNATIVAS SEGURAS:**\n\n`;
            responseText += `1. 🥦 **Sustituir por:** ${getAlternative(foodLower, category)}\n\n`;
            responseText += `2. 📋 **Receta alternativa sugerida:**\n`;
            responseText += getAlternativeRecipe(foodLower, category);
        }
    }
    
    return res.status(200).json({
        generated_text: responseText,
        food: food,
        option: option,
        is_spoiled: isSpoiled,
        food_category: category,
        ai_generated: false,
        fallback: true,
        success: true,
        timestamp: new Date().toISOString()
    });
}

// Datos de conservación por categoría
function getConservationData(food, category) {
    const data = {
        'frutas': `🌡️ **Temperatura ideal:** 4-8°C (refrigerador)\n🗓️ **Duración típica:** 3-7 días\n📦 **Envase ideal:** Bolsa perforada en cajón de frutas\n🚫 **Evitar:** Lavar antes de guardar\n`,
        'verduras': `🌡️ **Temperatura ideal:** 4-10°C\n🗓️ **Duración típica:** 5-10 días\n📦 **Envase ideal:** Bolsa de plástico con agujeros\n💧 **Humedad:** Alta (90-95%)\n`,
        'carnes': `🌡️ **Temperatura ideal:** 0-4°C\n🗓️ **Duración típica:** 1-2 días (cruda)\n📦 **Envase ideal:** Envase hermético en parte fría\n❄️ **Congelación:** -18°C por 3-6 meses\n`,
        'pescados': `🌡️ **Temperatura ideal:** 0-2°C\n🗓️ **Duración típica:** 1 día máximo\n📦 **Envase ideal:** Sobre hielo en recipiente\n👃 **Prueba de frescura:** Olor a mar fresco\n`,
        'lacteos': `🌡️ **Temperatura ideal:** 4-6°C\n🗓️ **Duración típica:** Consultar fecha\n📦 **Envase ideal:** Original cerrado\n🚫 **Evitar:** Temperatura ambiente >2h\n`,
        'pan': `🌡️ **Temperatura ideal:** Ambiente seco\n🗓️ **Duración típica:** 2-3 días\n📦 **Envase ideal:** Bolsa de tela\n❄️ **Congelación:** Rebanado por 3 meses\n`
    };
    
    return data[category] || `🌡️ **Almacenar en lugar fresco y seco**\n🗓️ **Consumir preferentemente en 3-5 días**\n📦 **Mantener en envase original cerrado**`;
}

function getShelfLife(food, category) {
    const shelfLife = {
        'frutas': '3-7 días refrigeradas',
        'verduras': '5-10 días refrigeradas',
        'carnes': '1-2 días refrigeradas, 3-6 meses congeladas',
        'pescados': '1 día refrigerado, 2-3 meses congelado',
        'lacteos': 'Consultar fecha de caducidad',
        'pan': '2-3 días a temperatura ambiente',
        'general': '3-5 días en condiciones adecuadas'
    };
    
    return shelfLife[category] || shelfLife.general;
}

function getSpecialTip(food, category) {
    const tips = {
        'frutas': 'Colocar una manzana madura junto a frutas verdes para acelerar su maduración de forma natural.',
        'verduras': 'Guardar con un paño de cocina absorbente para evitar la humedad excesiva.',
        'carnes': 'Congelar en porciones individuales para descongelar solo lo necesario.',
        'pescados': 'Colocar sobre un lecho de hielo en un recipiente con rejilla para que no esté en contacto directo con el agua.',
        'lacteos': 'Guardar en la parte menos fría del refrigerador (estantes superiores).',
        'pan': 'Congelar rebanado para poder tostar directamente sin necesidad de descongelar.',
        'general': 'Rotar los alimentos: colocar los más nuevos atrás y los que deben consumirse pronto delante.'
    };
    
    return tips[category] || tips.general;
}

function getRecipes(food, category) {
    const recipeTemplates = {
        'frutas': `🍎 **BATIDO ENERGÉTICO**\n📝 Ingredientes: 1 taza de ${food}, 1 plátano, 1 taza leche, miel\n👨‍🍳 Preparación: 1. Licuar todo 2. Servir frío 3. Decorar\n⏱️ Tiempo: 5 minutos\n\n🥗 **ENSALADA DE FRUTAS**\n📝 Ingredientes: ${food}, otras frutas, yogur, nueces\n👨‍🍳 Preparación: 1. Cortar frutas 2. Mezclar con yogur 3. Añadir nueces\n⏱️ Tiempo: 10 minutos`,
        'verduras': `🥬 **SALTEADO SALUDABLE**\n📝 Ingredientes: ${food}, ajo, aceite oliva, sal\n👨‍🍳 Preparación: 1. Cortar 2. Saltear 3. Condimentar\n⏱️ Tiempo: 15 minutos\n\n🥣 **CREMA DE ${food.toUpperCase()}**\n📝 Ingredientes: ${food}, cebolla, patata, caldo\n👨‍🍳 Preparación: 1. Cocinar 2. Triturar 3. Ajustar espesor\n⏱️ Tiempo: 30 minutos`,
        'carnes': `🍖 **${food.toUpperCase()} AL HORNO**\n📝 Ingredientes: ${food}, especias, aceite, limón\n👨‍🍳 Preparación: 1. Marinar 2. Hornear 3. Reposar\n⏱️ Tiempo: 40 minutos\n\n🍲 **GUISO TRADICIONAL**\n📝 Ingredientes: ${food}, verduras, vino, hierbas\n👨‍🍳 Preparación: 1. Dorar 2. Añadir líquido 3. Cocinar a fuego lento\n⏱️ Tiempo: 60 minutos`,
        'general': `🍽️ **RECETA RÁPIDA CON ${food.toUpperCase()}**\n📝 Ingredientes: ${food}, aceite, ajo, sal, especias\n👨‍🍳 Preparación: 1. Preparar ingredientes 2. Cocinar 3. Servir\n⏱️ Tiempo: 20 minutos\n\n🥘 **PREPARACIÓN BÁSICA**\n📝 Ingredientes: ${food}, cebolla, tomate, hierbas\n👨‍🍳 Preparación: 1. Sofreír 2. Cocinar 3. Añadir toque final\n⏱️ Tiempo: 25 minutos`
    };
    
    return recipeTemplates[category] || recipeTemplates.general;
}

function getAlternative(food, category) {
    const alternatives = {
        'frutas': 'Otra fruta fresca de temporada',
        'verduras': 'Otra verdura similar fresca',
        'carnes': 'Carne fresca o proteína vegetal (lentejas, garbanzos)',
        'pescados': 'Pescado fresco o conservas de pescado en buen estado',
        'lacteos': 'Productos lácteos frescos no abiertos',
        'pan': 'Pan fresco del día o pan congelado',
        'general': 'Un ingrediente fresco similar'
    };
    
    return alternatives[category] || alternatives.general;
}

function getAlternativeRecipe(food, category) {
    const alternatives = {
        'frutas': `🥤 **SMOOTHIE VERDE**\n📝 Espinaca, plátano, manzana, agua\n👨‍🍳 Licuar todo y servir\n⏱️ 5 minutos`,
        'verduras': `🥦 **SALTEADO DE BRÓCOLI**\n📝 Brócoli, ajo, salsa de soja, aceite\n👨‍🍳 Saltear rápidamente\n⏱️ 10 minutos`,
        'carnes': `🍗 **POLLO A LA PLANCHA**\n📝 Pechuga de pollo, limón, especias\n👨‍🍳 Marinar y cocinar\n⏱️ 20 minutos`,
        'general': `🍚 **ARROZ FRITO VEGETARIANO**\n📝 Arroz, huevo, verduras, soja\n👨‍🍳 Saltear todo junto\n⏱️ 15 minutos`
    };
    
    return alternatives[category] || alternatives.general;
}
