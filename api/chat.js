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
    
    console.log('✅ Token HF presente (primeros 10 chars):', HF_TOKEN.substring(0, 10) + '...');
    
    // ============================================
    // MÉTODO 1: HUGGINGFACE ROUTER (PRINCIPAL)
    // ============================================
    console.log('🚀 Método 1: Intentando HuggingFace Router...');
    
    let respuestaIA = null;
    let modeloUsado = null;
    let errorDetallado = null;
    
    // Lista de modelos a probar en el router
    const modelos = [
      'Qwen/Qwen2.5-7B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.2',
      'HuggingFaceH4/zephyr-7b-beta',
      'google/flan-t5-xxl'
    ];
    
    for (const modelo of modelos) {
      try {
        console.log(`🔄 Probando modelo en router: ${modelo}`);
        
        // Endpoint del router
        const endpoint = 'https://router.huggingface.co/hf-inference/models';
        
        // Construir payload
        const payload = {
          model: modelo,
          inputs: construirPrompt(food, option, isSpoiled),
          parameters: {
            max_new_tokens: 300,
            temperature: 0.7,
            top_p: 0.9
          }
        };
        
        console.log('📤 Enviando a router con payload:', JSON.stringify(payload).substring(0, 200) + '...');
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
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
        
        console.log(`📥 Router respondió para ${modelo}:`, {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Respuesta JSON para ${modelo}:`, JSON.stringify(data).substring(0, 300));
          
          // Intentar extraer texto de diferentes formatos
          let textoExtraido = null;
          
          if (Array.isArray(data) && data[0] && data[0].generated_text) {
            textoExtraido = data[0].generated_text;
          } else if (data.generated_text) {
            textoExtraido = data.generated_text;
          } else if (data[0] && typeof data[0] === 'string') {
            textoExtraido = data[0];
          } else if (typeof data === 'string') {
            textoExtraido = data;
          } else if (data.text) {
            textoExtraido = data.text;
          }
          
          if (textoExtraido && textoExtraido.length > 30) {
            console.log(`🎯 Modelo ${modelo} funcionó! Texto extraído (primeros 100 chars):`, textoExtraido.substring(0, 100));
            respuestaIA = textoExtraido;
            modeloUsado = modelo;
            break; // ¡Éxito!
          } else {
            console.log(`⚠️ Modelo ${modelo} respondió pero texto muy corto o inválido:`, textoExtraido?.length || 0);
          }
        } else {
          const errorText = await response.text().catch(() => 'Sin cuerpo de error');
          console.log(`❌ Modelo ${modelo} falló con status ${response.status}:`, errorText.substring(0, 200));
          errorDetallado = `Router ${response.status}: ${errorText.substring(0, 100)}`;
        }
        
      } catch (modeloError) {
        console.log(`⚠️ Error al probar modelo ${modelo}:`, modeloError.message);
      }
    }
    
    // ============================================
    // MÉTODO 2: API INFERENCE DIRECTA (FALLBACK)
    // ============================================
    if (!respuestaIA) {
      console.log('🔄 Método 1 falló, intentando Método 2: API Inference directa...');
      
      try {
        // Usar un modelo pequeño que suele estar cargado
        const modeloDirecto = 'google/flan-t5-xxl';
        const endpointDirecto = `https://api-inference.huggingface.co/models/${modeloDirecto}`;
        
        const promptDirecto = construirPromptSimple(food, option, isSpoiled);
        
        console.log('📤 Enviando a API directa...');
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        
        const response = await fetch(endpointDirecto, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: promptDirecto,
            parameters: {
              max_new_tokens: 200,
              temperature: 0.7
            }
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ API directa respondió:', JSON.stringify(data).substring(0, 300));
          
          if (Array.isArray(data) && data[0] && data[0].generated_text) {
            respuestaIA = data[0].generated_text;
            modeloUsado = modeloDirecto;
          }
        }
        
      } catch (directError) {
        console.log('⚠️ Método 2 también falló:', directError.message);
      }
    }
    
    // ============================================
    // DECIDIR QUÉ RESPONDER
    // ============================================
    if (respuestaIA && respuestaIA.length > 30) {
      console.log('🎉 ¡IA FUNCIONÓ! Enviando respuesta...');
      
      const respuestaLimpia = limpiarRespuesta(respuestaIA);
      
      return res.status(200).json({
        success: true,
        response: respuestaLimpia,
        source: 'huggingface_ai',
        model: modeloUsado,
        debug: {
          timestamp: new Date().toISOString(),
          responseLength: respuestaLimpia.length,
          methodUsed: 'router_and_direct',
          food,
          option,
          isSpoiled
        }
      });
      
    } else {
      console.log('💥 Todos los métodos fallaron. Usando fallback frontend.');
      
      return res.status(200).json({
        success: false,
        response: "", // Vacío para que frontend use su base
        source: 'all_methods_failed',
        error: errorDetallado || 'No se pudo conectar con ningún servicio de IA',
        debug: {
          timestamp: new Date().toISOString(),
          food,
          option,
          isSpoiled,
          instruction: 'use_frontend_fallback_immediately'
        }
      });
    }
    
  } catch (error) {
    console.error('💥 ERROR CRÍTICO en API:', error.message, error.stack);
    
    return res.status(200).json({
      success: false,
      response: "",
      source: 'api_critical_error',
      error: String(error.message),
      debug: {
        timestamp: new Date().toISOString(),
        instruction: 'use_frontend_fallback_immediately',
        stack: error.stack?.substring(0, 200)
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
      return `Eres un experto en seguridad alimentaria. Mi ${food} está en mal estado. ¿Qué debo hacer? ¿Es seguro consumir algo de él? ¿Cómo prevenir esto en el futuro? Responde en español de forma práctica y concisa.`;
    } else {
      return `Eres un especialista en conservación de alimentos. ¿Cómo puedo conservar ${food} fresco por más tiempo? Da consejos prácticos en español.`;
    }
  } else {
    if (isSpoiled) {
      return `Eres un chef profesional y experto en seguridad alimentaria. Tengo ${food} que parece estar en mal estado. ¿Es seguro cocinar con él? ¿Qué alternativas sugieres? Responde en español.`;
    } else {
      return `Eres un chef creativo. Proporciona una receta deliciosa, fácil y práctica usando ${food}. Responde en español con formato claro.`;
    }
  }
}

function construirPromptSimple(food, option, isSpoiled) {
  if (option === 'conservation') {
    return isSpoiled 
      ? `Consejos para ${food} en mal estado:`
      : `Cómo conservar ${food}:`;
  } else {
    return isSpoiled
      ? `Alternativas para ${food} en mal estado:`
      : `Receta con ${food}:`;
  }
}

function limpiarRespuesta(texto) {
  return texto
    .replace(/\\n/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/^\s+/, '')
    .trim();
}
