const express = require("express");
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { chat, getRelatedTickets, getSuggestedTickets } = require("../controllers/aiController");

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
      .withMessage("History content must be 4000 characters or less"),
    body("sessionId").optional().isString().trim().isLength({ min: 1, max: 120 }).withMessage("sessionId must be between 1 and 120 characters")
  ],
  validateRequest,
  chat
);

router.post(
  "/related-tickets",
  verifyToken,
  [
    body("query").isString().trim().isLength({ min: 2, max: 300 }).withMessage("query must be between 2 and 300 characters"),
    body("candidates").isArray({ min: 1, max: 12 }).withMessage("candidates must contain 1 to 12 items"),
    body("candidates.*.id").isString().trim().isLength({ min: 1, max: 80 }),
    body("candidates.*.label").optional().isString().trim().isLength({ max: 80 }),
    body("candidates.*.title").isString().trim().isLength({ min: 1, max: 160 }),
    body("candidates.*.question").isString().trim().isLength({ min: 1, max: 500 })
  ],
  validateRequest,
  getRelatedTickets
);

router.get("/suggested-tickets", verifyToken, getSuggestedTickets);

module.exports = router;
