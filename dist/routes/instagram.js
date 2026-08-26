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
router.get('/posts', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const url = `${config_1.default.instagram.url}&limit=${limit}`;
        const response = await axios_1.default.get(url);
        const posts = response.data.data.map((post) => ({
            id: post.id,
            caption: post.caption || 'Sem legenda',
            mediaUrl: post.media_url,
            permalink: post.permalink,
            type: post.media_type,
            timestamp: post.timestamp
        }));
        res.json({ mensagem: 'Posts vindo do Instagran: ', posts: posts });
    }
    catch (error) {
        console.error('Erro ao buscar posts do Instagram:', error);
        res.status(500).json({ error: 'Erro ao buscar posts do Instagram' });
    }
});
router.get('/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `https://graph.instagram.com/${id}?fields=id,caption,media_url,permalink,media_type,timestamp&access_token=${config_1.default.instagram.accessToken}`;
        const response = await axios_1.default.get(url);
        res.json(response.data);
    }
    catch (error) {
        console.error('Erro ao buscar post:', error);
        res.status(500).json({ error: 'Erro ao buscar post' });
    }
});
router.get('/stories', async (req, res) => {
    try {
        const url = `https://graph.instagram.com/me/stories?access_token=${config_1.default.instagram.accessToken}`;
        const response = await axios_1.default.get(url);
        res.json(response.data);
    }
    catch (error) {
        console.error('Erro ao buscar stories:', error);
        res.status(500).json({ error: 'Erro ao buscar stories' });
    }
});
//# sourceMappingURL=instagram.js.map