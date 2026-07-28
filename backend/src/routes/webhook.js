const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Rota principal para receber webhooks da Evolution API
router.post('/evolution', webhookController.handleEvolutionWebhook);

module.exports = router;
