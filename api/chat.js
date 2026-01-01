import { HfInference } from '@huggingface/inference';

const HF_TOKEN = process.env.HF_TOKEN;
const MODEL = 'Qwen/Qwen2.5-7B-Instruct';

const hf = new HfInference(HF_TOKEN);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { food, option, isSpoiled } = req.body;

  if (!food || !option) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  // Construir prompts según estado
  const queryType = option === 'conservation' 
    ? `Cómo conservar ${food} frescos por más tiempo`
    : `Dame una receta creativa y deliciosa usando ${food}`;

  let systemMessage = '';
  if (option === 'conservation') {
    systemMessage = isSpoiled
      ? `El usuario reporta que su ${food} está en mal estado. Proporciona consejos sobre seguridad alimentaria, cómo determinar si se puede salvar, y prevención de deterioro.`
      : `Proporciona consejos prácticos para conservar ${food} fresco por más tiempo.`;
  } else {
    systemMessage = isSpoiled
      ? `El usuario reporta que su ${food} está en mal estado. NO sugieras usarlo. Explica riesgos y alternativas seguras.`
      : `Proporciona una receta creativa, deliciosa y fácil usando ${food}.`;
  }

  const prompt = `<|im_start|>system
${systemMessage}<|im_end|>
<|im_start|>user
${queryType}<|im_end|>
<|im_start|>assistant
`;

  console.log('📤 Enviando a HuggingFace...', { food, option, isSpoiled });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await hf.textGeneration({
      model: MODEL,
      inputs: prompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
        top_p: 0.95,
        repetition_penalty: 1.2,
        return_full_text: false
      }
    }, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    let cleanedText = response.generated_text
      .replace(/<\|im_end\|>/g, '')
      .replace(/<\|im_start\|>/g, '')
      .trim();

    if (!cleanedText) throw new Error('Respuesta vacía');

    return res.status(200).json({
      response: cleanedText,
      debug: { model: MODEL, isSpoiled }
    });

  } catch (error) {
    console.error('❌ Error API:', error.message);
    
    // Fallbacks inteligentes
    let fallback = '';
    if (option === 'conservation') {
      fallback = isSpoiled
        ? `⚠️ Por seguridad, descarta el ${food} si muestra moho. Limpia la zona de almacenamiento.`
        : `Conserva ${food} en lugar fresco y ventilado. Revisa regularmente.`;
    } else {
      fallback = isSpoiled
        ? `No es seguro cocinar con ${food} en mal estado. Usa ingredientes frescos.`
        : `Lava y corta el ${food}. Combínalo con ingredientes frescos para una comida saludable.`;
    }

    return res.status(200).json({
      response: fallback,
      error: error.message,
      debug: { fallback: true, isSpoiled }
    });
  }
}
