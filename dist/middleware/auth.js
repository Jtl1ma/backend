"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.adminMiddleware = adminMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.default.jwtSecret || 'secret');
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}
function adminMiddleware(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    next();
}
//# sourceMappingURL=auth.js.map