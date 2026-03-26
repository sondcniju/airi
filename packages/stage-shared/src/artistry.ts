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
export const ARTISTRY_PRESET_GROUPS = [
  {
    id: 'fabrics',
    label: 'Fabric Lab',
    icon: 'i-solar:palette-bold-duotone',
    presets: [
      { id: 'gold', label: 'Gold Leaf', icon: 'i-solar:star-bold-duotone', text: 'Divine Golden transformation. Pure white velvet fabric with thick 24k gold leaf embroidery and glowing white celestial patterns.' },
      { id: 'gothic', label: 'Midnight Gothic', icon: 'i-solar:ghost-bold-duotone', text: 'Midnight Gothic style. Deep matte black fabric, crimson lace ruffles, dark leather straps, silver scrollwork embroidery.' },
      { id: 'royal', label: 'Royal Porcelain', icon: 'i-solar:crown-minimalistic-bold-duotone', text: 'Royal Porcelain style. White silk base, hand-painted cobalt blue patterns, golden silk sashes, jade ornaments.' },
      { id: 'denim', label: 'Raw Indigo Denim', icon: 'i-solar:t-shirt-bold-duotone', text: 'Heavyweight dark indigo denim with thick orange contrast stitching and realistic weathered fading.' },
      { id: 'plaid', label: 'Classic Tartan Plaid', icon: 'i-solar:widget-bold-duotone', text: 'Traditional red and green Scottish wool plaid with a visible woven texture and cozy feel.' },
      { id: 'satin', label: 'Powder Blue Satin', icon: 'i-solar:water-drops-bold-duotone', text: 'Highly reflective, pale baby blue silk with smooth flowing "liquid" highlights and high luster.' },
      { id: 'hex', label: 'Tactical Hex-Grid', icon: 'i-solar:shield-bold-duotone', text: 'Matte olive drab fabric with a subtle hexagonal heat-pressed grid pattern and dark grey utility straps.' },
      { id: 'camo', label: 'Cyber Pink Camo', icon: 'i-solar:skateboarding-bold-duotone', text: 'Vibrant hot pink and charcoal grey urban camouflage with a slight tech-fabric sheen.' },
    ],
  },
  {
    id: 'hair',
    label: 'Hair Salon',
    icon: 'i-solar:scissors-bold-duotone',
    presets: [
      { id: 'silver', label: 'Iridescent Silver', icon: 'i-solar:snowflake-bold-duotone', text: 'Pure white hair with subtle prismatic "oil-slick" highlights that catch the light.' },
      { id: 'onyx', label: 'Onyx Gloss', icon: 'i-solar:moon-bold-duotone', text: 'Pitch black hair with a high-mirror shine and sharp, high-contrast highlights.' },
      { id: 'sunset', label: 'Sunset Ombre', icon: 'i-solar:sun-2-bold-duotone', text: 'Vibrant gradient from deep copper roots to fiery orange and golden blonde tips.' },
      { id: 'mint', label: 'Ghost Mint', icon: 'i-solar:leaf-bold-duotone', text: 'Soft, matte pastel mint green with a "cloud-like" ethereal texture.' },
      { id: 'pink', label: 'Bubblegum Pop', icon: 'i-solar:heart-bold-duotone', text: 'High-gloss, vibrant candy pink with a plastic-like shine and white "rim" highlights.' },
      { id: 'rainbow', label: 'Retrowave Rainbow', icon: 'i-solar:filters-bold-duotone', text: 'Multi-colored "raver girl" hair; dark roots with glowing neon streaks of cyan, magenta, and lime green.' },
    ],
  },
  {
    id: 'eyes',
    label: 'Iris Forge',
    icon: 'i-solar:eye-bold-duotone',
    presets: [
      { id: 'dragon', label: 'Dragon Slit', icon: 'i-solar:fire-bold-duotone', text: 'Glowing orange irises with vertical black slit pupils and a subtle reptilian texture.' },
      { id: 'heart', label: 'Succubus Heart', icon: 'i-solar:heart-angle-bold-duotone', text: 'Soft pink irises with glowing white heart-shaped pupils and a "love-struck" aura.' },
      { id: 'star', label: 'Celestial Star', icon: 'i-solar:star-fall-bold-duotone', text: 'Deep violet eyes with white star-shaped pupils and a subtle ring of stardust.' },
      { id: 'galaxy', label: 'Nebula Galaxy', icon: 'i-solar:atom-bold-duotone', text: 'Deep space irises containing tiny sparkling stars and purple nebula clusters.' },
      { id: 'cyber-eye', label: 'Cyber Scan', icon: 'i-solar:scanner-2-bold-duotone', text: 'Glowing cyan HUD-style eyes with digital scanning rings and data-stream pupils.' },
    ],
  },
  {
    id: 'special',
    label: 'Special Motifs',
    icon: 'i-solar:magic-stick-bold-duotone',
    presets: [
      { id: 'lotus', label: 'Argent Lotus', icon: 'i-solar:flower-bold-duotone', text: 'The Argent Lotus motif. Translucent white silk petal layers over heavy silver brocade, with delicate silver filigree lotus accents.' },
    ],
  },
]
