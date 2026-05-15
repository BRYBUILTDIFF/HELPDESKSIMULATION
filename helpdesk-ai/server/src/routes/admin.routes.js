const express = require("express");
const { body, param } = require("express-validator");
const {
  listUsers,
  updateUser,
  softDeleteUser,
  getPolicyEvents,
  getPolicySummaryAdmin,
  getSimulationModules,
  updateSimulationModule
} = require("../controllers/adminController");
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

router.get("/policy/events", getPolicyEvents);
router.get("/policy/summary", getPolicySummaryAdmin);
router.get("/simulation-modules", getSimulationModules);
router.patch(
  "/simulation-modules/:id",
  [
    param("id").isString().notEmpty().withMessage("Valid module id is required"),
    body("enabled").optional().isBoolean().withMessage("enabled must be boolean"),
    body("difficulty").optional().isIn(["Easy", "Medium", "Hard"]).withMessage("difficulty must be Easy, Medium, or Hard")
  ],
  validateRequest,
  updateSimulationModule
);

module.exports = router;
