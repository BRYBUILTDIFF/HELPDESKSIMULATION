const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

const emailRule = body("email")
  .trim()
  .toLowerCase()
  .isEmail()
  .withMessage("Valid email is required");

const passwordRule = body("password")
  .isString()
  .withMessage("Password is required")
  .isLength({ min: 8 })
  .withMessage("Password must be at least 8 characters");

router.post(
  "/register",
  [
    body("firstName").trim().notEmpty().withMessage("First name is required"),
    body("lastName").trim().notEmpty().withMessage("Last name is required"),
    emailRule,
    passwordRule
  ],
  validateRequest,
  authController.register
);

router.post("/login", [emailRule, passwordRule], validateRequest, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", verifyToken, authController.getMe);

module.exports = router;
