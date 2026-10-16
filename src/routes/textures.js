import { Router } from 'express';

import { generateTexture, textureCatalog } from '../textures/generate.js';
import { encodePng } from '../textures/png.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(textureCatalog());
});

router.post('/', (req, res, next) => {
  try {
    const { map = 'albedo', ...options } = req.body ?? {};

    if (!['albedo', 'normal', 'roughness'].includes(map)) {
      throw new RangeError('Unknown texture map');
    }

    const texture = generateTexture(options);
    const png = encodePng(texture.width, texture.height, texture.maps[map]);

    res.type('png').send(png);
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

export default router;
