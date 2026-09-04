import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import config from '../config';

const router = Router();

// Helper: retry com backoff exponencial
async function axiosWithRetry(url: string, options: any, maxRetries = 2): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get(url, options);
      return res.data;
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || '';
      if (msg.includes('Invalid OAuth access token')) {
        console.error('[Instagram] Token inválido:', msg);
        throw err;
      }
      if (attempt === maxRetries) throw err;
      console.warn(`[Instagram] Tentativa ${attempt}/${maxRetries}:`, msg);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('Unreachable');
}



// Buscar posts do Instagram
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const { limit = 3 } = req.query;
    const url = `${config.instagram.apiUrl}/${config.instagram.businessId}/media`;
    const data = await axiosWithRetry(url, {
      params: {
        fields: 'id,caption,media_url,permalink,media_type',
        access_token: config.instagram.accessToken,
        limit: limit
      }
    });

    const posts = (data?.data || []).map((post: any) => ({
      id: post.id,
      caption: post.caption || 'Novas publicações no Instagram',
      mediaUrl: post.media_url,
      permalink: post.permalink,
      type: post.media_type
    }));
    console.log('Postagens: ', posts);
    res.json({ mensagem: 'Posts vindo do Instagram:', posts });
  } catch (error: any) {
    const msg = error?.response?.data?.error?.message || error?.message;
    console.error('Erro ao buscar posts do Instagram:', msg, config.instagram.accessToken);
    res.status(error?.response?.status || 500).json({ error: 'Erro ao buscar posts', details: msg });
  }
});

// Buscar post específico
router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const url = `https://graph.instagram.com/v26.0/${id}`;
    const data = await axiosWithRetry(url, {
      params: {
        fields: 'id,caption,media_url,permalink,media_type',
        access_token: config.instagram.accessToken
      }
    });
    res.json(data);
  } catch (error: any) {
    const msg = error?.response?.data?.error?.message || error?.message;
    console.error('Erro ao buscar post:', msg);
    res.status(error?.response?.status || 500).json({ error: 'Erro ao buscar post', details: msg });
  }
});

// Buscar stories (se tiver permissão)
router.get('/stories', async (req: Request, res: Response) => {
  try {
    const url = `https://graph.instagram.com/v26.0/me/stories`;
    const data = await axiosWithRetry(url, {
      params: { access_token: config.instagram.accessToken }
    });
    res.json(data);
  } catch (error: any) {
    const msg = error?.response?.data?.error?.message || error?.message;
    console.error('Erro ao buscar stories:', msg);
    res.status(error?.response?.status || 500).json({ error: 'Erro ao buscar stories', details: msg });
  }
});

export { router as instagramRouter };
