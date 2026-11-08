const express = require("express");
const { body, param } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { listEnabledSimulationModules, completeSimulationModule } = require("../controllers/simulationController");

const router = express.Router();

router.use(verifyToken);
router.get("/modules", listEnabledSimulationModules);
const attempts = require("../controllers/simulationAttemptController");
router.post("/modules/:id/attempts", [param("id").isLength({ min: 1, max: 80 })], validateRequest,
  require("../middleware/requestLimits").requestLimit("simulation-attempts", { max: 30, windowMs: 3600000, key: req => req.user.id }), attempts.startAttempt);
router.post("/modules/:id/attempts/:attemptId/commands", [
  param("id").isLength({ min: 1, max: 80 }), param("attemptId").isLength({ min: 1, max: 120 }),
  body("command").isString().isLength({ min: 1, max: 1000 }), body("step").isInt({ min: 0, max: 12 }).toInt()
], validateRequest, attempts.submitCommand);
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
