import { HfInference } from '@huggingface/inference';

// Configuración
const HF_TOKEN = process.env.HF_TOKEN;

// Lista de modelos en orden de prioridad
const MODELOS_PRIORIDAD = [
  {
    nombre: 'Qwen/Qwen2.5-7B-Instruct',
    descripcion: 'Principal - Buen equilibrio',
    formato: 'chatml'
  },
  {
    nombre: 'mistralai/Mistral-7B-Instruct-v0.2',
    descripcion: 'Alternativa rápida',
    formato: 'llama2'
  },
  {
    nombre: 'HuggingFaceH4/zephyr-7b-beta',
    descripcion: 'Optimizado para chat',
    formato: 'chatml'
  },
  {
    nombre: 'google/flan-t5-xxl',
    descripcion: 'Rápido y confiable',
    formato: 'simple'
  },
  {
    nombre: 'microsoft/DialoGPT-medium',
    descripcion: 'Pequeño y eficiente',
    formato: 'dialogue'
  }
];

export default async function handler(req, res) {
  console.log('🤖 API Iniciada - Método:', req.method);
  
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
      error: 'Método no permitido. Use POST.' 
    });
  }

  try {
    const { food, option, isSpoiled } = req.body;
    
    // Validación básica
    if (!food || !option) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos obligatorios: food y option' 
      });
    }

    console.log('📥 Datos recibidos:', { food, option, isSpoiled });
    
    // ============================================
    // VERIFICACIÓN DEL TOKEN
    // ============================================
    if (!HF_TOKEN) {
      console.error('❌ ERROR: HF_TOKEN no configurado en Vercel');
      return res.status(200).json({
        success: false,
        response: "",
        source: 'no_token',
        error: 'Token de HuggingFace no configurado',
        debug: { instruction: 'use_frontend_fallback' }
      });
    }
    
    console.log('✅ Token HF presente (longitud:', HF_TOKEN.length, ')');
    
    // ============================================
    // INTENTAR CON MÚLTIPLES MODELOS
    // ============================================
    let respuestaFinal = null;
    let modeloUsado = null;
    let errores = [];
    
    const hf = new HfInference(HF_TOKEN);
    
    for (const modelo of MODELOS_PRIORIDAD) {
      try {
        console.log(`🔄 Probando modelo: ${modelo.nombre} (${modelo.descripcion})`);
        
        // Construir prompt según el formato del modelo
        const prompt = construirPrompt(modelo.formato, food, option, isSpoiled);
        
        console.log(`📝 Prompt para ${modelo.nombre}: ${prompt.substring(0, 100)}...`);
        
        const inicio = Date.now();
        
        const response = await hf.textGeneration({
          model: modelo.nombre,
          inputs: prompt,
          parameters: {
            max_new_tokens: 400,
            temperature: 0.7,
            top_p: 0.9,
            repetition_penalty: 1.1,
            return_full_text: false
          }
        }, {
          use_cache: true,
          wait_for_model: true,
          timeout: 30000 // 30 segundos por modelo
        });
        
        const tiempo = Date.now() - inicio;
        console.log(`⏱️ ${modelo.nombre} respondió en ${tiempo}ms`);
        
        if (response && response.generated_text) {
          let textoLimpio = limpiarRespuesta(response.generated_text, modelo.formato);
          
          // Validar que la respuesta sea útil
          if (esRespuestaValida(textoLimpio)) {
            console.log(`✅ ${modelo.nombre} funcionó! Longitud: ${textoLimpio.length} chars`);
            respuestaFinal = textoLimpio;
            modeloUsado = modelo.nombre;
            break; // ¡Éxito! Salimos del loop
          } else {
            console.log(`⚠️ ${modelo.nombre} respondió inválido: "${textoLimpio.substring(0, 50)}"`);
            errores.push(`${modelo.nombre}: respuesta inválida`);
          }
        }
        
      } catch (modeloError) {
        console.log(`❌ ${modelo.nombre} falló:`, modeloError.message);
        errores.push(`${modelo.nombre}: ${modeloError.message}`);
        // Continuar con el siguiente modelo
      }
    }
    
    // ============================================
    // EVALUAR RESULTADOS
    // ============================================
    if (respuestaFinal && modeloUsado) {
      // ¡ÉXITO! Tenemos respuesta de IA
      console.log(`🎉 IA funcionó con ${modeloUsado}`);
      
      return res.status(200).json({
        success: true,
        response: respuestaFinal,
        source: 'huggingface_ai',
        model: modeloUsado,
        debug: {
          timestamp: new Date().toISOString(),
          food,
          option,
          isSpoiled,
          responseLength: respuestaFinal.length,
          modelsTried: MODELOS_PRIORIDAD.length,
          errors: errores
        }
      });
      
    } else {
      // TODOS los modelos fallaron
      console.error('💥 Todos los modelos fallaron');
      
      return res.status(200).json({
        success: false,
        response: "",
        source: 'all_models_failed',
        error: 'Todos los modelos de IA fallaron',
        debug: {
          timestamp: new Date().toISOString(),
          errors: errores,
          modelsTried: MODELOS_PRIORIDAD.length,
          instruction: 'use_frontend_fallback'
        }
      });
    }
    
  } catch (error) {
    console.error('💥 ERROR GENERAL en API:', error.message);
    
    return res.status(200).json({
      success: false,
      response: "",
      source: 'api_error',
      error: error.message,
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

function construirPrompt(formato, food, option, isSpoiled) {
  let systemPrompt, userPrompt;
  
  if (option === 'conservation') {
    if (isSpoiled) {
      systemPrompt = `Eres un experto en seguridad alimentaria. El ${food} del usuario está en mal estado. Proporciona consejos PRÁCTICOS de seguridad en español.`;
      userPrompt = `Mi ${food} muestra signos de deterioro. ¿Qué debo hacer?`;
    } else {
      systemPrompt = `Eres un especialista en conservación de alimentos. Da consejos PRÁCTICOS para conservar ${food} fresco en español.`;
      userPrompt = `¿Cómo conservo ${food} fresco por más tiempo?`;
    }
  } else {
    if (isSpoiled) {
      systemPrompt = `Eres un chef y experto en seguridad alimentaria. El ${food} del usuario está en mal estado.`;
      userPrompt = `Tengo ${food} en mal estado. ¿Es seguro cocinarlo? ¿Alternativas?`;
    } else {
      systemPrompt = `Eres un chef creativo. Proporciona una receta DELICIOSA y FÁCIL usando ${food} en español.`;
      userPrompt = `Dame una receta con ${food}`;
    }
  }
  
  // Formatear según el tipo de modelo
  switch(formato) {
    case 'chatml':
      return `<|im_start|>system
${systemPrompt}<|im_end|>
<|im_start|>user
${userPrompt}<|im_end|>
<|im_start|>assistant
`;
    
    case 'llama2':
      return `<s>[INST] <<SYS>>
${systemPrompt}
<</SYS>>

${userPrompt} [/INST]`;
    
    case 'dialogue':
      return `System: ${systemPrompt}\nHuman: ${userPrompt}\nAI:`;
    
    default:
      return `${systemPrompt}\n\nPregunta: ${userPrompt}\nRespuesta:`;
  }
}

function limpiarRespuesta(texto, formato) {
  // Limpiar según formato
  let limpio = texto
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|im_end\|>/g, '')
    .replace(/assistant:/gi, '')
    .replace(/system:/gi, '')
    .replace(/user:/gi, '')
    .replace(/\[INST\].*?\[\/INST\]/g, '')
    .replace(/<<SYS>>.*?<</SYS>>/g, '')
    .replace(/\\n/g, '\n')
    .trim();
  
  // Eliminar líneas vacías al inicio
  return limpio.replace(/^\s*\n+/g, '');
}

function esRespuestaValida(texto) {
  if (!texto) return false;
  if (texto.length < 20) return false;
  if (texto.includes('Loading') || texto.includes('loading')) return false;
  if (texto.includes('model is currently loading')) return false;
  if (texto.includes('timeout')) return false;
  if (texto.includes('error')) return false;
  
  return true;
}
