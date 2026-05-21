const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { listEnabledSimulationModules } = require("../controllers/simulationController");

const router = express.Router();

router.use(verifyToken);
router.get("/modules", listEnabledSimulationModules);

module.exports = router;
