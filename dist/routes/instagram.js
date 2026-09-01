"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramRouter = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../config"));
const router = (0, express_1.Router)();
exports.instagramRouter = router;
async function axiosWithRetry(url, options, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await axios_1.default.get(url, options);
            return res.data;
        }
        catch (err) {
            const msg = err?.response?.data?.error?.message || err?.message || '';
            if (msg.includes('Invalid OAuth access token')) {
                console.error('[Instagram] Token inválido:', msg);
                throw err;
            }
            if (attempt === maxRetries)
                throw err;
            console.warn(`[Instagram] Tentativa ${attempt}/${maxRetries}:`, msg);
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw new Error('Unreachable');
}
router.get('/posts', async (req, res) => {
    try {
        const { limit = 3 } = req.query;
        const url = `${config_1.default.instagram.apiUrl}${config_1.default.instagram.businessId}/media`;
        const data = await axiosWithRetry(url, {
            params: {
                fields: 'id,caption,media_url,permalink,media_type',
                access_token: config_1.default.instagram.accessToken,
                limit: limit
            }
        });
        const posts = (data?.data || []).map((post) => ({
            id: post.id,
            caption: post.caption || 'Novas publicações no Instagram',
            mediaUrl: post.media_url,
            permalink: post.permalink,
            type: post.media_type
        }));
        console.log('Postagens: ', posts);
        res.json({ mensagem: 'Posts vindo do Instagram:', posts });
    }
    catch (error) {
        const msg = error?.response?.data?.error?.message || error?.message;
        console.error('Erro ao buscar posts do Instagram:', msg, config_1.default.instagram.accessToken);
        res.status(error?.response?.status || 500).json({ error: 'Erro ao buscar posts', details: msg });
    }
});
router.get('/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `https://graph.instagram.com/v26.0/${id}`;
        const data = await axiosWithRetry(url, {
            params: {
                fields: 'id,caption,media_url,permalink,media_type',
                access_token: config_1.default.instagram.accessToken
            }
        });
        res.json(data);
    }
    catch (error) {
        const msg = error?.response?.data?.error?.message || error?.message;
        console.error('Erro ao buscar post:', msg);
        res.status(error?.response?.status || 500).json({ error: 'Erro ao buscar post', details: msg });
    }
});
router.get('/stories', async (req, res) => {
    try {
        const url = `https://graph.instagram.com/v26.0/me/stories`;
        const data = await axiosWithRetry(url, {
            params: { access_token: config_1.default.instagram.accessToken }
        });
        res.json(data);
    }
    catch (error) {
        const msg = error?.response?.data?.error?.message || error?.message;
        console.error('Erro ao buscar stories:', msg);
        res.status(error?.response?.status || 500).json({ error: 'Erro ao buscar stories', details: msg });
    }
});
//# sourceMappingURL=instagram.js.map