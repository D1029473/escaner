export default async function handler(req, res) {
  console.log('🚀 API Iniciada');
  
  // Headers CORS importantes
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
        error: 'Faltan campos obligatorios'
      });
    }

    console.log('📥 Datos recibidos:', { food, option, isSpoiled });

    // ============================================
    // INTENTO 1: HuggingFace IA REAL
    // ============================================
    let aiResponse = null;
    let aiError = null;
    let usedFallback = false;
    
    const HF_TOKEN = process.env.HF_TOKEN;
    console.log('🔑 HF_TOKEN presente?:', HF_TOKEN ? 'Sí (longitud: ' + HF_TOKEN.length + ')' : 'No');
    
    // MODELOS DISPONIBLES (por orden de preferencia)
    const MODELS = [
      'mistralai/Mistral-7B-Instruct-v0.2',  // Muy estable
      'HuggingFaceH4/zephyr-7b-beta',        // Alternativa buena
      'google/flan-t5-xxl',                   // Modelo más ligero
      'Qwen/Qwen2.5-7B-Instruct'             // Última opción
    ];
    
    if (HF_TOKEN && HF_TOKEN.length > 10) {
      console.log('🤖 Intentando HuggingFace con token...');
      
      for (const MODEL of MODELS) {
        try {
          console.log(`🔄 Probando modelo: ${MODEL}`);
          
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 45000); // 45 segundos
          
          // Construir prompt según modelo
          let prompt = '';
          if (MODEL.includes('mistral') || MODEL.includes('zephyr')) {
            // Formato para modelos instruct
            prompt = `<s>[INST] ${option === 'conservation' 
              ? (isSpoiled 
                ? `El usuario reporta que su ${food} está en mal estado. Proporciona consejos de seguridad sobre si se puede salvar y cómo prevenir deterioro futuro.` 
                : `Proporciona consejos prácticos para conservar ${food} fresco por más tiempo.`)
              : (isSpoiled 
                ? `El usuario reporta que su ${food} está en mal estado. Explica por qué no se debe cocinar con alimentos en mal estado y da alternativas seguras.` 
                : `Proporciona una receta creativa, deliciosa y fácil usando ${food}.`)
            } [/INST]`;
          } else {
            // Formato genérico
            prompt = option === 'conservation'
              ? (isSpoiled 
                ? `Consejos de seguridad para ${food} en mal estado: `
                : `Cómo conservar ${food} fresco: `)
              : (isSpoiled 
                ? `Alternativas seguras para ${food} en mal estado: `
                : `Receta con ${food}: `);
          }
          
          console.log('📝 Prompt:', prompt.substring(0, 150) + '...');
          
          const hfResponse = await fetch(
            `https://api-inference.huggingface.co/models/${MODEL}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                inputs: prompt,
                parameters: {
                  max_new_tokens: 350,
                  temperature: 0.8,
                  top_p: 0.95,
                  repetition_penalty: 1.1,
                  return_full_text: false
                }
              }),
              signal: controller.signal
            }
          );
          
          clearTimeout(timeout);
          
          console.log('📡 Respuesta HTTP:', {
            modelo: MODEL,
            status: hfResponse.status,
            statusText: hfResponse.statusText,
            ok: hfResponse.ok
          });
          
          if (hfResponse.ok) {
            const data = await hfResponse.json();
            console.log('📊 Respuesta JSON:', JSON.stringify(data).substring(0, 300));
            
            // Extraer texto de diferentes formatos
            if (Array.isArray(data) && data[0] && data[0].generated_text) {
              aiResponse = data[0].generated_text;
            } else if (data.generated_text) {
              aiResponse = data.generated_text;
            } else if (data[0] && data[0].generated_text) {
              aiResponse = data[0].generated_text;
            } else if (typeof data === 'string') {
              aiResponse = data;
            } else {
              console.log('ℹ️ Formato no reconocido, intentando extraer...');
              aiResponse = JSON.stringify(data);
            }
            
            if (aiResponse && aiResponse.length > 20) {
              console.log(`✅ Modelo ${MODEL} funcionó! Longitud: ${aiResponse.length}`);
              break; // Salir del loop, encontramos modelo que funciona
            } else {
              console.log(`⚠️ Modelo ${MODEL} respondió muy corto: ${aiResponse?.length || 0} chars`);
              aiResponse = null;
            }
          } else {
            const errorText = await hfResponse.text().catch(() => 'No error body');
            console.log(`❌ Modelo ${MODEL} falló: ${hfResponse.status} - ${errorText.substring(0, 100)}`);
            // Continuar al siguiente modelo
          }
          
        } catch (hfError) {
          console.log(`⚠️ Error con modelo ${MODEL}:`, hfError.message);
          // Continuar al siguiente modelo
        }
      }
      
      if (!aiResponse) {
        aiError = 'Todos los modelos fallaron';
        console.log('💥 Todos los modelos de HuggingFace fallaron');
      }
      
    } else {
      aiError = 'No HF_TOKEN configurado';
      console.log('ℹ️ Sin token HF, usando fallback directo');
    }

    // ============================================
    // DECISIÓN: ¿Qué enviar al frontend?
    // ============================================
    console.log('🔄 Estado final:', {
      tieneAiResponse: !!aiResponse,
      longitud: aiResponse?.length || 0,
      tieneError: !!aiError
    });
    
    // CASO 1: Tenemos respuesta de IA válida
    if (aiResponse && aiResponse.length > 30) {
      console.log('📤 Enviando respuesta IA al frontend');
      
      // Limpiar respuesta si es necesario
      const cleanResponse = aiResponse
        .replace(/<\|.*?\|>/g, '')
        .replace(/\[INST\].*?\[\/INST\]/g, '')
        .replace(/\\n/g, '\n')
        .trim();
      
      return res.status(200).json({
        success: true,
        response: cleanResponse,
        source: 'huggingface',
        debug: {
          timestamp: new Date().toISOString(),
          food,
          option,
          isSpoiled,
          responseLength: cleanResponse.length,
          modelUsed: 'varios_intentados'
        }
      });
    }
    
    // CASO 2: No hay IA, enviar señal para usar base de datos frontend
    console.log('🎯 Enviando señal para usar base de datos local del frontend');
    
    return res.status(200).json({
      success: true,
      response: "", // Vacío para que frontend use su base
      source: 'frontend_fallback',
      debug: {
        timestamp: new Date().toISOString(),
        food,
        option,
        isSpoiled,
        hfError: aiError || 'No se obtuvo respuesta de IA',
        instruction: 'use_frontend_database'
      }
    });

  } catch (error) {
    console.error('💥 ERROR CRÍTICO en API:', error.message, error.stack);
    
    // Error crítico pero siempre respondemos
    return res.status(200).json({
      success: true,
      response: "",
      source: 'emergency_fallback',
      error: error.message,
      debug: { 
        emergency: true,
        instruction: 'use_frontend_database' 
      }
    });
  }
}
