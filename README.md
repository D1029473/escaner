# 🥗 Save & Taste - Intelligent Food Scanner

## 🚀 Características Principales

### 🔍 Escaneo Inteligente
- **Detección en tiempo real** con Teachable Machine
- **Precisión mejorada** con umbrales dinámicos
- **Multi-fuente**: Cámara o galería
- **Procesamiento optimizado** para móviles

### 🤖 Asistente de IA
- **Conservación**: Tips específicos por alimento
- **Recetas**: Sugerencias saludables y prácticas
- **Modelos especializados** por tipo de consulta
- **Respuestas en caché** para mejor rendimiento

### 📱 Experiencia de Usuario
- **Diseño responsive** (mobile-first)
- **Animaciones fluidas** y feedback táctil
- **Modo oscuro/light** automático
- **Optimizado para WebView** (AppMySite)

## 🛠️ Tecnologías

### Backend
- **Vercel Functions** - Serverless deployment
- **Hugging Face API** - Modelos de IA
- **Node.js 18+** - Runtime moderno

### Frontend
- **Vanilla JavaScript** - Sin frameworks pesados
- **Teachable Machine** - Modelo de visión
- **TensorFlow.js** - Inference en cliente

### Infraestructura
- **Vercel** - Hosting y CDN
- **Cloudflare** - DNS y seguridad
- **Google Analytics** - Telemetría (opcional)

## 📦 Instalación

```bash
# Clonar repositorio
git clone https://github.com/D1029473/escaner.git
cd escaner

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus tokens

# Desplegar
vercel deploy --prod
