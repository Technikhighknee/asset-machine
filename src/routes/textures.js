import { Router } from 'express';

import { generateTexture, textureCatalog } from '../textures/generate.js';
import { encodeGray16Png, encodePng } from '../textures/png.js';
import { encodeZip } from '../textures/zip.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(textureCatalog());
});

router.post('/', (req, res, next) => {
  try {
    const { map = 'albedo', bitDepth = 8, ...options } = req.body ?? {};

    if (!['albedo', 'normal', 'roughness', 'height', 'ao', 'cavity'].includes(map)) {
      throw new RangeError('Unknown texture map');
    }

    if (![8, 16].includes(bitDepth) || (bitDepth === 16 && map !== 'height')) {
      throw new RangeError('16-bit export is supported for height only');
    }

    const texture = generateTexture(options);
    const pixels = texture.maps[map];

    if (!pixels || (bitDepth === 16 && !texture.height16)) {
      throw new RangeError('This material does not support the requested map or bit depth');
    }

    const png = bitDepth === 16
      ? encodeGray16Png(texture.width, texture.height, texture.height16)
      : encodePng(texture.width, texture.height, pixels);

    res.type('png').send(png);
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

router.post('/preview', (req, res, next) => {
  try {
    const texture = generateTexture(req.body);
    const maps = {};

    for (const [name, pixels] of Object.entries(texture.maps)) {
      maps[name] = encodePng(texture.width, texture.height, pixels).toString('base64');
    }

    res.json({ maps });
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

router.post('/export', (req, res, next) => {
  try {
    const { material, size = 2048 } = req.body ?? {};

    if (material !== 'roof-thatch' || size !== 2048) {
      throw new RangeError('2K PBR bundle export currently supports reed thatch only');
    }

    const texture = generateTexture({ material, size });
    const maps = texture.maps;

    const files = {
      'reed-thatch_basecolor.png': encodePng(size, size, maps.albedo),
      'reed-thatch_normal-opengl.png': encodePng(size, size, maps.normal),
      'reed-thatch_roughness.png': encodePng(size, size, maps.roughness),
      'reed-thatch_ao.png': encodePng(size, size, maps.ao),
      'reed-thatch_cavity.png': encodePng(size, size, maps.cavity),
      'reed-thatch_height-16bit.png': encodeGray16Png(size, size, texture.height16),
    };

    const zip = encodeZip(files);

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reed-thatch-2k.zip"',
    );
    res.type('application/zip').send(zip);
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
});

export default router;
