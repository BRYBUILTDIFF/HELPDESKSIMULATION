const express = require("express");
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { getMySessions, saveMySessions } = require("../controllers/sessionController");

const router = express.Router();

router.use(verifyToken);

router.get("/", getMySessions);
router.put(
  "/",
  [body("sessions").isArray().withMessage("sessions must be an array")],
  validateRequest,
  saveMySessions
);

module.exports = router;
