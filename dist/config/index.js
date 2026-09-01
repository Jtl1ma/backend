"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freeModeles = void 0;
const dotenv = require('dotenv');
dotenv.config({ expand: true });
exports.default = {
    jwtSecret: process.env.JWT_SECRET || 'Jtl1mA-Loty11NscguiarA@opneSource_Jwtf',
    jwtRefreshSecret: process.env.JWT_SECRET_REFRESH || 'secret_refresh',
    port: process.env.PORT || 3001,
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
    whatsApp: {
        admin: process.env.ADMIN_WHATSAPP_NUMBER,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        url: process.env.WHATSAPP_API_URL
    },
    instagram: {
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
        businessId: process.env.INSTAGRAM_BUSINESS_ID,
        apiUrl: process.env.INSTAGRAM_API_URL,
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    openrout: {
        apiKey: process.env.OPENROUTE_API_KEY,
        url: process.env.OPENROUTE_URL,
        openUrl: process.env.URL_OPENROUTE,
    },
};
exports.freeModeles = [
    "gpt-5.5",
    "openrouter/free",
    "gpt-5.4-mini",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-31b-it:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
];
//# sourceMappingURL=index.js.map