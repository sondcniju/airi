import { defineInvokeEventa } from '@moeru/eventa'

export const artistryGenerateHeadless = defineInvokeEventa<{ imageUrl?: string, base64?: string, error?: string }, { prompt: string, model?: string, provider?: string, options?: Record<string, any>, globals?: Record<string, any> }>('eventa:invoke:electron:artistry:generate-headless')

export const REPLICATE_PRESETS = [
  {
    id: 'qwen-image',
    label: 'Qwen Image (Vibrant Generation)',
    cost: 'Fast',
    model: 'qwen/qwen-image',
    prompt: 'Bookstore window display. A sign displays "New Arrivals This Week". Below, a shelf tag with the text "Best-Selling Novels Here". To the side, a colorful poster advertises "Author Meet And Greet on Saturday" with a central portrait of the author. There are four books on the bookshelf, namely "The light between worlds" "When stars are scattered" "The slient patient" "The night circus"',
    json: JSON.stringify({
      go_fast: true,
      guidance: 4,
      strength: 0.9,
      image_size: 'optimize_for_quality',
      lora_scale: 1,
      aspect_ratio: '16:9',
      output_format: 'webp',
      enhance_prompt: false,
      output_quality: 80,
      negative_prompt: ' ',
      num_inference_steps: 50,
    }, null, 2),
  },
  {
    id: 'seedream',
    label: 'SeeDream 4.5 (Cinematic Café)',
    cost: '4K',
    model: 'bytedance/seedream-4.5',
    prompt: 'A warm, nostalgic film-style interior of a cozy café, shot on 35mm-inspired digital photography with soft afternoon sunlight filtering through the front windows. Wooden shelves display neatly arranged ceramics, pastries, and coffee beans. Hand-painted signage on the main interior window reads ‘Seedream 4.5’ in clean, classic lettering, similar to boutique branding. A vintage bicycle with a wicker basket is visible outside the entrance, casting soft shadows on the floor. Rich textures, natural light, warm tones, subtle grain, and calm neighborhood-café ambiance.',
    json: JSON.stringify({
      size: '4K',
      max_images: 1,
      image_input: [],
      aspect_ratio: '16:9',
      sequential_image_generation: 'disabled',
    }, null, 2),
  },
  {
    id: 'p-image-edit',
    label: 'P-Image-Edit (Texture Swapper)',
    cost: 'Turbo',
    model: 'prunaai/p-image-edit',
    prompt: 'The woman\'s dress is changed to black',
    json: JSON.stringify({
      turbo: true,
      images: [{ value: '{{IMAGE}}' }],
      aspect_ratio: '1:1',
    }, null, 2),
  },
]
