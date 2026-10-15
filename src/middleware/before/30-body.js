import express from 'express';
import { config } from '../../config.js';

const json = express.json({ limit: config.jsonLimit });
const form = express.urlencoded({ extended: false, limit: config.jsonLimit });

export default function parseBody(req, res, next) {
  json(req, res, (error) => {
    if (error) return next(error);
    form(req, res, next);
  });
}
