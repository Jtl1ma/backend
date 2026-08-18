const { Router } = require('express');
const fileController = require('../controllers/fileController');

const router = Router();

router.post('/upload', fileController.upload);
router.get('/list', fileController.list);

module.exports = router;