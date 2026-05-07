const express = require("express");
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { chat } = require("../controllers/aiController");

const router = express.Router();

router.post(
  "/chat",
  verifyToken,
  [
    body("message")
      .isString()
      .withMessage("Message is required")
      .trim()
      .isLength({ min: 1, max: 4000 })
      .withMessage("Message must be between 1 and 4000 characters"),
    body("history").optional().isArray({ max: 20 }).withMessage("History must be an array"),
    body("history.*.role")
      .optional()
      .isIn(["user", "assistant"])
      .withMessage("History role must be user or assistant"),
    body("history.*.content")
      .optional()
      .isString()
      .withMessage("History content must be a string")
      .isLength({ max: 4000 })
      .withMessage("History content must be 4000 characters or less")
  ],
  validateRequest,
  chat
);

module.exports = router;
