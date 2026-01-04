export default async function handler(req, res) {
  console.log('🤖 Save & Taste API Iniciada');
  
  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Método no permitido' 
    });
  }

  try {
    const { food, option, isSpoiled } = req.body;
    
    // Validación básica
    if (!food || !option) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos obligatorios' 
      });
    }

    console.log('📥 Datos recibidos:', { food, option, isSpoiled });
    
    // ============================================
    // VERIFICACIÓN DEL TOKEN
    // ============================================
    const HF_TOKEN = process.env.HF_TOKEN;
    
    if (!HF_TOKEN) {
      console.log('❌ HF_TOKEN no configurado en Vercel');
      return res.status(200).json({
        success: false,
        response: "",
        source: 'no_token',
        error: 'Token de HuggingFace no configurado',
        debug: { instruction: 'use_frontend_fallback' }
      });
    }
    
    console.log('✅ Token HF presente');
    
    // ============================================
    // USAR MODELOS CONFIABLES Y DISPONIBLES
    // ============================================
    // Modelos que casi siempre están disponibles (pequeños y rápidos)
    const modelosConfiable = [
      {
        name: 'microsoft/DialoGPT-small',
        endpoint: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-small',
        prompt: (food, option, isSpoiled) => 
          option === 'conservation' 
            ? (isSpoiled ? `Consejos para ${food} en mal estado:` : `Cómo conservar ${food}:`)
            : (isSpoiled ? `Alternativas para ${food} en mal estado:` : `Receta con ${food}:`)
      },
      {
        name: 'distilgpt2',
        endpoint: 'https://api-inference.huggingface.co/models/distilgpt2',
        prompt: (food, option, isSpoiled) =>
          `Usuario: ${option === 'conservation' 
            ? (isSpoiled ? `Mi ${food} está en mal estado. ¿Qué hago?` : `¿Cómo conservo ${food} fresco?`)
            : (isSpoiled ? `¿Puedo cocinar con ${food} en mal estado?` : `Receta con ${food}`)
          } Asistente:`
      },
      {
        name: 'google/flan-t5-base',
        endpoint: 'https://api-inference.huggingface.co/models/google/flan-t5-base',
        prompt: (food, option, isSpoiled) =>
          option === 'conservation'
            ? (isSpoiled ? `question: What should I do with spoiled ${food}? answer:` : `question: How to preserve ${food}? answer:`)
            : (isSpoiled ? `question: Can I cook with spoiled ${food}? answer:` : `question: Recipe with ${food}? answer:`)
      }
    ];
    
    let respuestaIA = null;
    let modeloUsado = null;
    
    for (const modelo of modelosConfiable) {
      try {
        console.log(`🔄 Probando: ${modelo.name}`);
        
        const prompt = modelo.prompt(food, option, isSpoiled);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        
        const response = await fetch(modelo.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json',
            'x-wait-for-model': 'true' // IMPORTANTE: Espera si el modelo está cargando
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 250,
              temperature: 0.8,
              top_p: 0.9,
              return_full_text: false
            }
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        console.log(`📡 ${modelo.name} - Status:`, response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ ${modelo.name} respondió`);
          
          // Extraer texto de diferentes formatos de respuesta
          let textoExtraido = extraerTextoDeRespuesta(data);
          
          if (textoExtraido && textoExtraido.length > 15 && !textoExtraido.includes('loading')) {
            respuestaIA = textoExtraido;
            modeloUsado = modelo.name;
            console.log(`🎯 ${modelo.name} funcionó! Texto: ${textoExtraido.substring(0, 80)}...`);
            break;
          }
        } else {
          const errorText = await response.text().catch(() => '');
          console.log(`⚠️ ${modelo.name} falló: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        
      } catch (error) {
        console.log(`❌ Error con ${modelo.name}:`, error.message);
      }
    }
    
    // ============================================
    // DECIDIR QUÉ RESPONDER
    // ============================================
    if (respuestaIA && modeloUsado) {
      console.log('📤 Enviando respuesta IA al frontend');
      
      const respuestaLimpia = limpiarRespuesta(respuestaIA);
      
      return res.status(200).json({
        success: true,
        response: respuestaLimpia,
        source: 'huggingface_ai',
        model: modeloUsado,
        debug: {
          timestamp: new Date().toISOString(),
          responseLength: respuestaLimpia.length,
          food,
          option,
          isSpoiled
        }
      });
      
    } else {
      console.log('🎯 IA no disponible, usando fallback frontend');
      
      return res.status(200).json({
        success: false,
        response: "",
        source: 'huggingface_failed',
        error: 'No se pudo conectar con IA',
        debug: {
          timestamp: new Date().toISOString(),
          food,
          option,
          isSpoiled,
          instruction: 'use_frontend_fallback'
        }
      });
    }
    
  } catch (error) {
    console.error('💥 ERROR en API:', error.message);
    
    return res.status(200).json({
      success: false,
      response: "",
      source: 'api_error',
      error: String(error.message),
      debug: {
        timestamp: new Date().toISOString(),
        instruction: 'use_frontend_fallback'
      }
    });
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function extraerTextoDeRespuesta(data) {
  try {
    if (Array.isArray(data)) {
      if (data[0] && data[0].generated_text) return data[0].generated_text;
      if (typeof data[0] === 'string') return data[0];
      if (data[0] && data[0].label) return data[0].label;
    }
    
    if (data.generated_text) return data.generated_text;
    if (data.text) return data.text;
    if (data.label) return data.label;
    if (typeof data === 'string') return data;
    
    // Último intento: convertir a string
    return JSON.stringify(data);
  } catch (e) {
    return null;
  }
}

function limpiarRespuesta(texto) {
  if (!texto) return '';
  
  return texto
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .trim();
}
