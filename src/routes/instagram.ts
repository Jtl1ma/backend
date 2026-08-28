import { Router, Request, Response } from 'express';
import axios from 'axios';
import config from '../config';

const router = Router();

// Buscar posts do Instagram
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    
    const url = `https://graph.facebook.com/${config.instagram.businessId}/media`; 
        
    const response = await axios.get(url, {
      params: {
        fields: 'id,caption,media_url,permalink,media_type',
        access_token: config.instagram.accessToken,
        limit: limit
      }
    });
    
    const posts = response.data.data.map((post: any) => ({
      id: post.id,
      caption: post.caption || 'Novas publicações no Instagran' || 'Sem legenda',
      mediaUrl: post.media_url,
      permalink: post.permalink,
      type: post.media_type,
      //timestamp: post.timestamp
    }));
    
    res.json({ mensagem: 'Posts vindo do Instagran: ' , posts: posts });
  } catch (error:any) {
    console.error('Erro ao buscar posts do Instagram:', error.message);
    res.status(500).json({ error: 'Erro ao buscar posts do Instagram' });
  }
});

// Buscar post específico
router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const url = `https://graph.instagram.com/${id}`;
    //?fields=id,caption,media_url,permalink,media_type,timestamp&access_token=${config.instagram.accessToken}
    const response = await axios.get(url, {
      params: {
        fields: 'id,caption,media_url,permalink,media_type',
        access_token: config.instagram.accessToken,
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Erro ao buscar post:', error);
    res.status(500).json({ error: 'Erro ao buscar post' });
  }
});

// Buscar stories (se tiver permissão)
router.get('/stories', async (req: Request, res: Response) => {
  try {
    const url = `https://graph.instagram.com/me/stories?access_token=${config.instagram.accessToken}`;
    
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error('Erro ao buscar stories:', error);
    res.status(500).json({ error: 'Erro ao buscar stories' });
  }
});

export { router as instagramRouter };