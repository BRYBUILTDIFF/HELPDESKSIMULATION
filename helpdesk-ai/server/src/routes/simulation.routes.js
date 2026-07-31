const express = require("express");
const { body, param } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { listEnabledSimulationModules, completeSimulationModule } = require("../controllers/simulationController");

const router = express.Router();

router.use(verifyToken);
router.get("/modules", listEnabledSimulationModules);
router.post(
  "/modules/:id/complete",
  [
    param("id").isString().trim().isLength({ min: 1, max: 80 }),
    body("attemptKey").isString().trim().isLength({ min: 8, max: 180 }),
    body("surface").isString().trim().isIn(["windows-os", "windows-terminal", "mac-terminal", "mac-os"]),
    body("stepsCompleted").isInt({ min: 0, max: 100 })
  ],
  validateRequest,
  completeSimulationModule
);

module.exports = router;
