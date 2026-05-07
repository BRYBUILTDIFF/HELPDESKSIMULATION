const express = require("express");
const { body, param } = require("express-validator");
const { listUsers, updateUser, softDeleteUser } = require("../controllers/adminController");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/users", listUsers);

router.patch(
  "/users/:id",
  [
    param("id").isInt().withMessage("Valid user id is required"),
    body("role").optional().isIn(["USER", "ADMIN"]).withMessage("Role must be USER or ADMIN"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean")
  ],
  validateRequest,
  updateUser
);

router.delete(
  "/users/:id",
  [param("id").isInt().withMessage("Valid user id is required")],
  validateRequest,
  softDeleteUser
);

module.exports = router;
