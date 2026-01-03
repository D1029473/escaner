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
    
    console.log('✅ Token HF presente, intentando IA...');
    
    // ============================================
    // USAR HUGGINGFACE ROUTER (EL QUE SÍ FUNCIONA)
    // ============================================
    let respuestaIA = null;
    
    try {
      // Endpoint del router de HuggingFace
      const endpoint = 'https://router.huggingface.co/hf-inference/models';
      
      // Construir prompt
      const prompt = construirPrompt(food, option, isSpoiled);
      
      console.log('📝 Prompt:', prompt);
      
      // Construir payload para el router
      const payload = {
        model: 'Qwen/Qwen2.5-7B-Instruct',
        inputs: prompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.7,
          top_p: 0.9,
          repetition_penalty: 1.1
        }
      };
      
      console.log('📤 Enviando a HuggingFace Router...');
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000); // 45 segundos
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      console.log('📥 Respuesta HTTP:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Router respondió correctamente');
        
        // Extraer texto de la respuesta del router
        if (Array.isArray(data) && data[0] && data[0].generated_text) {
          respuestaIA = data[0].generated_text;
        } else if (data.generated_text) {
          respuestaIA = data.generated_text;
        } else if (typeof data === 'string') {
          respuestaIA = data;
        } else if (data[0] && typeof data[0] === 'string') {
          respuestaIA = data[0];
        }
        
        if (respuestaIA) {
          console.log('🎯 IA funcionó, longitud:', respuestaIA.length);
        } else {
          console.log('⚠️ No se pudo extraer respuesta de IA');
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ Router error:', response.status, errorText.substring(0, 100));
      }
      
    } catch (routerError) {
      console.log('⚠️ Error en router:', routerError.message);
    }
    
    // ============================================
    // DECIDIR QUÉ RESPONDER
    // ============================================
    if (respuestaIA && respuestaIA.length > 30) {
      console.log('📤 Enviando respuesta IA al frontend');
      
      // Limpiar respuesta
      const respuestaLimpia = limpiarRespuesta(respuestaIA);
      
      return res.status(200).json({
        success: true,
        response: respuestaLimpia,
        source: 'huggingface_ai',
        model: 'Qwen2.5-via-Router',
        debug: {
          timestamp: new Date().toISOString(),
          responseLength: respuestaLimpia.length
        }
      });
    } else {
      console.log('🎯 IA no disponible, señalando fallback');
      
      return res.status(200).json({
        success: false,
        response: "",
        source: 'huggingface_failed',
        error: 'No se pudo conectar con IA',
        debug: {
          timestamp: new Date().toISOString(),
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

function construirPrompt(food, option, isSpoiled) {
  if (option === 'conservation') {
    if (isSpoiled) {
      return `[INST] Eres un experto en seguridad alimentaria. Mi ${food} está en mal estado. ¿Qué debo hacer? ¿Es seguro? ¿Cómo prevenir? Responde en español de forma clara y práctica. [/INST]`;
    } else {
      return `[INST] Eres un especialista en conservación de alimentos. ¿Cómo conservo ${food} fresco por más tiempo? Da consejos prácticos en español. [/INST]`;
    }
  } else {
    if (isSpoiled) {
      return `[INST] Eres un chef experto en seguridad alimentaria. Tengo ${food} en mal estado. ¿Es seguro cocinar? ¿Qué alternativas sugieres? Responde en español. [/INST]`;
    } else {
      return `[INST] Eres un chef creativo. Dame una receta deliciosa y fácil usando ${food}. Responde en español con ingredientes y pasos. [/INST]`;
    }
  }
}

function limpiarRespuesta(texto) {
  if (!texto) return '';
  
  return texto
    .replace(/\[INST\].*?\[\/INST\]/g, '')
    .replace(/\\n/g, '\n')
    .replace(/^\s+/, '')
    .trim();
}
