const express = require('express');
const router = express.Router();
const webhookConfigController = require('../controllers/webhookConfigController');

router.get('/', webhookConfigController.getConfig);
router.post('/', webhookConfigController.updateConfig);
router.post('/tailscale-login', webhookConfigController.tailscaleLogin);

module.exports = router;
