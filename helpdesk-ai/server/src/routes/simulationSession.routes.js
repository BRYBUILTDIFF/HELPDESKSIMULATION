const express = require("express");
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { createSimulationSession, getSimulationSession, connectSimulationSession, endSimulationSession } = require("../controllers/simulationSessionController");

const router = express.Router();
router.use(verifyToken);
router.post("/", [body("moduleId").isString().trim().notEmpty().withMessage("moduleId is required")], validateRequest, createSimulationSession);
router.get("/:id", getSimulationSession);
router.post("/:id/connect", connectSimulationSession);
router.post("/:id/end", endSimulationSession);

module.exports = router;
