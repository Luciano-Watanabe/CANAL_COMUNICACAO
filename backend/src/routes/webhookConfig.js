const express = require('express');
const router = express.Router();
const webhookConfigController = require('../controllers/webhookConfigController');

router.get('/', webhookConfigController.getConfig);
router.post('/', webhookConfigController.updateConfig);

module.exports = router;
