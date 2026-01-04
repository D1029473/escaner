// api/chat.js - VERSIÓN 8.1 CORREGIDA
export default async function handler(req, res) {
  console.log('🤖 Save & Taste API v8.1 Iniciada');
  
  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Método no permitido' 
    });
  }

  try {
    const { food, option, isSpoiled } = req.body;
    
    if (!food || !option) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos obligatorios: food y option' 
      });
    }

    console.log('📥 Datos:', { food, option, isSpoiled });
    
    const HF_TOKEN = process.env.HF_TOKEN;
    
    if (!HF_TOKEN) {
      console.log('❌ Sin HF_TOKEN, usando fallback');
      return sendFallbackResponse(food, option, isSpoiled, res);
    }
    
    console.log('✅ Token HF presente');
    
    // ============================================
    // INTENTAR HUGGING FACE CON FORMATO CORRECTO
    // ============================================
    let respuestaIA = null;
    let modeloUsado = null;
    
    // NUEVO ENDPOINT CORRECTO (formato OpenAI-compatible)
    const API_URL = "https://router.huggingface.co/v1/chat/completions";
    const MODEL = "meta-llama/Llama-3.2-3B-Instruct";
    
    console.log(`🚀 Llamando a: ${API_URL} con modelo ${MODEL}`);
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      
      // Construir mensajes en formato OpenAI
      const systemMessage = option === 'conservation'
        ? 'Eres un experto en conservación de alimentos. Responde de forma concisa y práctica en español.'
        : 'Eres un chef creativo. Da recetas rápidas y deliciosas en español.';
      
      const userMessage = construirPrompt(food, option, isSpoiled);
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 300,
          temperature: 0.7
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      console.log(`📡 Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Respuesta recibida');
        
        // Extraer del formato OpenAI
        if (data.choices && data.choices.length > 0) {
          const message = data.choices[0].message;
          if (message && message.content) {
            respuestaIA = message.content;
            modeloUsado = MODEL;
            console.log(`✅ IA funcionó: ${respuestaIA.substring(0, 100)}...`);
          }
        }
      } else {
        const errorText = await response.text().catch(() => 'Sin detalles');
        console.log(`⚠️ Error ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
    } catch (fetchError) {
      console.log(`❌ Fetch error: ${fetchError.message}`);
    }
    
    // ============================================
    // USAR FALLBACK SI IA FALLÓ
    // ============================================
    if (!respuestaIA) {
      console.log('🎯 Usando fallback local');
      return sendFallbackResponse(food, option, isSpoiled, res);
    }
    
    // ============================================
    // ENVIAR RESPUESTA EXITOSA
    // ============================================
    console.log('📤 Enviando respuesta de IA');
    
    return res.status(200).json({
      success: true,
      response: respuestaIA,
      source: 'ai_service',
      model: modeloUsado,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('💥 ERROR CRÍTICO:', error.message);
    
    // Siempre devolver algo útil
    return sendFallbackResponse(
      req.body?.food || 'alimento', 
      req.body?.option || 'conservation', 
      req.body?.isSpoiled || false, 
      res
    );
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function construirPrompt(food, option, isSpoiled) {
  if (option === 'conservation') {
    if (isSpoiled) {
      return `Mi ${food} está en mal estado. Dame 3 consejos prácticos sobre qué hacer.`;
    } else {
      return `Dame 3 consejos concretos para conservar ${food} fresco por más tiempo.`;
    }
  } else {
    if (isSpoiled) {
      return `Tengo ${food} en mal estado. ¿Es seguro cocinar? ¿Qué alternativas tengo?`;
    } else {
      return `Dame una receta rápida y deliciosa con ${food}. Incluye ingredientes y pasos.`;
    }
  }
}

// Ya no necesitamos extraerTexto porque usamos formato OpenAI estándar

function sendFallbackResponse(food, option, isSpoiled, res) {
  const response = option === 'conservation'
    ? generateConservationFallback(food, isSpoiled)
    : generateRecipeFallback(food, isSpoiled);
  
  return res.status(200).json({
    success: true,
    response: response,
    source: 'local_fallback',
    model: 'database_local',
    timestamp: new Date().toISOString()
  });
}

function generateConservationFallback(food, isSpoiled) {
  if (isSpoiled) {
    return `🚫 **${food.toUpperCase()} EN MAL ESTADO**

⚠️ **NO CONSUMIR**

🔴 **Señales de deterioro:**
• Moho visible (puntos verdes, blancos, negros)
• Olor desagradable o fermentado
• Textura viscosa o babosa
• Decoloración severa

💡 **Qué hacer:**
1. Aísla para evitar contaminación
2. Limpia el área con agua y jabón
3. Desecha en bolsa sellada
4. Verifica alimentos cercanos

✅ **Prevención futura:**
• Almacena en condiciones adecuadas
• Revisa cada 2-3 días
• Usa contenedores ventilados
• Consume primero los más maduros`;
  }
  
  const consejos = {
    tomate: `✅ **CONSERVAR TOMATES**

🌡️ **Temperatura:** 10-15°C (NO nevera si verdes)
📦 **Cómo:** Fuera de nevera, en lugar fresco
⏱️ **Duración:** 5-7 días
💡 **Tip:** Nunca refrigeres tomates verdes`,

    manzana: `✅ **CONSERVAR MANZANAS**

🌡️ **Temperatura:** 0-4°C (nevera)
📦 **Cómo:** Separadas de otras frutas
⏱️ **Duración:** 1-2 meses
💡 **Tip:** Producen etileno, aíslalas`,

    platano: `✅ **CONSERVAR PLÁTANOS**

🌡️ **Temperatura:** 13-15°C (NO nevera)
📦 **Cómo:** Colgados, no en bolsa
⏱️ **Duración:** 3-5 días
💡 **Tip:** Separa del racimo para madurar más lento`,

    zanahoria: `✅ **CONSERVAR ZANAHORIAS**

🌡️ **Temperatura:** 0-4°C (nevera)
📦 **Cómo:** Bolsa perforada
⏱️ **Duración:** 2-3 semanas
💡 **Tip:** Corta las hojas antes de guardar`
  };
  
  const foodKey = food.toLowerCase();
  
  if (consejos[foodKey]) {
    return consejos[foodKey];
  }
  
  return `✅ **CONSERVAR ${food.toUpperCase()}**

🌡️ **Temperatura:** 4-8°C (nevera)
📦 **Cómo:** Recipiente ventilado
⏱️ **Duración:** 5-7 días
💡 **Tip:** No laves hasta el momento de usar

🚫 **Errores comunes:**
1. Lavar antes de guardar
2. Almacenar cerca de etileno
3. Cambios bruscos de temperatura`;
}

function generateRecipeFallback(food, isSpoiled) {
  if (isSpoiled) {
    return `⛔ **NO USES ${food.toUpperCase()} EN MAL ESTADO**

🚨 **Riesgos:**
• Micotoxinas (no se eliminan con calor)
• Bacterias patógenas
• Esporas de moho

💡 **Alternativas:**
1. Usa ${food} fresco
2. Prueba vegetales similares
3. Opta por congelados

⚠️ Las toxinas NO desaparecen cocinando`;
  }
  
  const recetas = {
    tomate: `🍽️ **RECETA: TOMATE**

⏱️ 10 min | 🟢 Fácil

🥗 Ensalada rápida:
• 2 tomates en gajos
• 1/2 cebolla
• Aceite + sal + orégano

🔥 Salteado:
1. Saltea con ajo 2 min
2. Añade huevo
3. Sirve en tostada`,

    manzana: `🍽️ **RECETA: MANZANA**

⏱️ 15 min | 🟢 Fácil

🥗 Ensalada:
• Manzana en cubos
• Nueces
• Queso fresco
• Aceite + vinagre

🔥 Asada:
1. Corta en gajos
2. Canela + miel
3. Horno 180°C - 15 min`,

    platano: `🍽️ **RECETA: PLÁTANO**

⏱️ 10 min | 🟢 Fácil

🥞 Panqueques:
• 2 plátanos aplastados
• 2 huevos
• Canela

🔥 Preparación:
1. Mezcla todo
2. Sartén 2 min/lado
3. Sirve con miel`,

    zanahoria: `🍽️ **RECETA: ZANAHORIA**

⏱️ 15 min | 🟢 Fácil

🥗 Ensalada:
• Zanahoria rallada
• Limón + aceite
• Sal

🔥 Salteada:
1. Saltea con ajo
2. Añade comino
3. Sirve con arroz`
  };
  
  const foodKey = food.toLowerCase();
  
  if (recetas[foodKey]) {
    return recetas[foodKey];
  }
  
  return `🍽️ **RECETA: ${food.toUpperCase()}**

⏱️ 15 min | 🟢 Fácil

🥗 Ensalada:
• ${food} cortado
• Verduras frescas
• Aceite + limón

🔥 Salteado:
1. Saltea con ajo
2. Añade especias
3. Sirve con cereal`;
}
