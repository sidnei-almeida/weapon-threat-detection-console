# weapon-threat-detection-console

Real-time computer vision console for detecting weapon-related threat objects using a YOLO object detection model.

## Local ONNX model validation

This repository includes a small Node.js sandbox for inspecting and testing the exported YOLO ONNX models locally before any frontend or deployment work.

### Install dependencies

```bash
npm install
```

### Inspect both ONNX models

This checks that both model files exist, prints input/output metadata, and runs a dummy inference with a `[1, 3, 640, 640]` tensor:

```bash
npm run inspect:onnx
```

### Test inference on a local image

Sample images from the project dataset are available in `images/`:

- `images/gun_01.jpg`
- `images/knife_01.jpg`
- `images/person_with_mask_01.jpg`

Use the FP32 model by default:

```bash
npm run test:image -- ./images/gun_01.jpg
```

Or run the script directly:

```bash
node scripts/test-image-inference.js ./images/gun_01.jpg
node scripts/test-image-inference.js ./images/knife_01.jpg int8
```

The image script loads the model, preprocesses the image to `640x640`, runs inference, and prints detections as JSON.

Class names are read from `dataset/data.yaml` when available (`gun`, `knife`, `person_with_mask`).

FP32 is the recommended default for validation. INT8 is supported for experimentation, but treat it as experimental until accuracy is compared on real images.

### Threat level assessment

Threat scoring is implemented in `src/yolo/assessThreat.js`, ported from the reference project `yolo26-weapon-threat-detection`.

Each detection contributes `confidence × class_weight`:

| Class | Weight |
|-------|--------|
| gun | 1.00 |
| knife | 0.85 |
| person_with_mask | 0.60 |

The final score combines:

- **peak score** — highest individual detection score
- **quantity bonus** — +0.05 per extra detection (max +0.30)
- **context bonus** — extra points when weapons appear with a masked person (+0.07) or when gun and knife appear together (+0.05)

Threat levels:

| Level | Rule |
|-------|------|
| critical | 2+ guns with score ≥ 0.75, or score ≥ 0.85 with 4+ detections |
| high | score ≥ 0.75, or 3+ weapons with score ≥ 0.55 |
| medium | score ≥ 0.45, or 3+ detections with score ≥ 0.35 |
| low | any remaining detection |
| none | no detections |

Run threat assessment on all sample images:

```bash
npm run test:threat
npm run test:threat -- int8
```

## Deploy na Vercel (plano gratuito)

Este projeto foi adaptado para rodar na Vercel:

- **Frontend + vídeos** → pasta `public/` (CDN da Vercel)
- **API** → `api/index.js` (serverless Express)
- **Inferência YOLO** → `models/` incluído na função serverless

### 1. Commitar assets no GitHub

Estes arquivos **precisam** ir pro repositório:

```
public/videos/*.mp4   (~31 MB total)
models/roadvision_yolo_fp32.onnx   (~38 MB)
```

GitHub aceita arquivos até 100 MB. Se preferir repo mais leve, use [Git LFS](https://git-lfs.com).

```bash
git add public/videos models package.json package-lock.json vercel.json api server public src dataset
git commit -m "Prepare Vercel deployment"
git push origin main
```

### 2. Conectar na Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Importe o repositório do GitHub
3. Framework Preset: **Other**
4. Deploy (sem variáveis obrigatórias para YOLO local)

### 3. Limitações do plano free

| Item | Detalhe |
|------|---------|
| Timeout | **10 s** por requisição — cold start + modelo pode demorar na 1ª análise |
| Socket.IO | Só funciona em **localhost**; na Vercel o feed usa HTTP (`/api/analyze`) |
| Histórico de eventos | Reseta quando a função serverless reinicia |

Se a inferência falhar por timeout, configure **Roboflow** nas Environment Variables da Vercel:

```
DETECTION_BACKEND=roboflow
ROBOFLOW_API_KEY=sua_chave
ROBOFLOW_PROJECT_WEAPON=seu_projeto
ROBOFLOW_PROJECT_MASK=seu_projeto_mask
```

### 4. Desenvolvimento local

```bash
npm install
npm run dev
# http://localhost:3001
```

Vídeos ficam em `public/videos/` (servidos em `/videos/...`).

