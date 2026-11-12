const express = require("express");
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { createSimulationSession, getSimulationSession, connectSimulationSession, endSimulationSession } = require("../controllers/simulationSessionController");

const router = express.Router();
router.use(verifyToken);
router.post("/", require("../middleware/requestLimits").requestLimit("lab-launch", { max: 12, windowMs: 60000, key: req => req.user.id }), [body("moduleId").isString().trim().notEmpty().withMessage("moduleId is required"), body("chatSessionId").optional().isString().trim().isLength({min:1,max:120})], validateRequest, createSimulationSession);
router.get("/:id", getSimulationSession);
router.post("/:id/connect", require("../middleware/requestLimits").requestLimit("lab-connect", { max: 30, windowMs: 60000, key: req => req.user.id }), connectSimulationSession);
router.post("/:id/end", endSimulationSession);

module.exports = router;
