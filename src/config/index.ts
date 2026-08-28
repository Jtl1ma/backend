//import OpenAI from "openai";

const dotenv = require('dotenv');
dotenv.config({expand: true});

export default {
  
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  jwtRefreshSecret: process.env.JWT_SECRET_REFRESH,
  port: process.env.PORT,
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',

  whatsApp: {
    admin: process.env.ADMIN_WHATSAPP_NUMBER,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiUrl: process.env.WHATSAPP_API_URL,
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
    url:  process.env.OPENROUTE_URL,
    openUrl: process.env.URL_OPENROUTE,
    //model: process.env.OPENROUTE_MODEL
  },

};

/*export const client = new OpenAI({ 
  apiKey: process.env.OPENROUTE_API_KEY,
  baseURL: process.env.OPENROUTE_URL || 'https://openrouter.ai/api/v1'
});*/


// Lista de modelos gratuitos em ordem de preferência
 export const freeModeles = [
   "openrouter/free",
   "gpt-5.4-mini",
   "nvidia/nemotron-3-ultra-550b-a55b:free",
   "openai/gpt-oss-120b:free",
   "google/gemma-4-31b-it:free",
   "qwen/qwen3-next-80b-a3b-instruct:free",
   "qwen/qwen3.8-27b",
 ];