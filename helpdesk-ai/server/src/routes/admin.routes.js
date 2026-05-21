const express = require("express");
const { body, param } = require("express-validator");
const {
  listUsers,
  createUser,
  updateUser,
  hardDeleteUser,
  getPolicyEvents,
  getPolicySummaryAdmin,
  getPolicyConfigAdmin,
  replacePolicyConfigAdmin,
  addPolicyListEntryAdmin,
  updatePolicyListEntryAdmin,
  deletePolicyListEntryAdmin,
  resetPolicyConfigAdmin,
  getSimulationModules,
  getSimulationPromptInsights,
  disregardSimulationPromptInsight,
  generateSimulationModuleDraft,
  createSimulationModule,
  updateSimulationModule,
  deleteSimulationModule
} = require("../controllers/adminController");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/users", listUsers);
router.post(
  "/users",
  [
    body("firstName").trim().notEmpty().withMessage("First name is required"),
    body("lastName").trim().notEmpty().withMessage("Last name is required"),
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password")
      .isString()
      .withMessage("Password is required")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("role").optional().isIn(["USER", "ADMIN"]).withMessage("Role must be USER or ADMIN"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean")
  ],
  validateRequest,
  createUser
);

router.patch(
  "/users/:id",
  [
    param("id").isInt().withMessage("Valid user id is required"),
    body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),
    body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),
    body("email").optional().trim().isEmail().withMessage("Valid email is required"),
    body("password")
      .optional()
      .isString()
      .withMessage("Password must be a string")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
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
  hardDeleteUser
);

router.get("/policy/events", getPolicyEvents);
router.get("/policy/summary", getPolicySummaryAdmin);
router.get("/policy/config", getPolicyConfigAdmin);
router.put("/policy/config", replacePolicyConfigAdmin);
router.post(
  "/policy/config/:listName",
  [
    param("listName")
      .isIn(["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns"])
      .withMessage("Invalid policy list"),
    body("value").isString().trim().notEmpty().withMessage("value is required")
  ],
  validateRequest,
  addPolicyListEntryAdmin
);
router.patch(
  "/policy/config/:listName/:index",
  [
    param("listName")
      .isIn(["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns"])
      .withMessage("Invalid policy list"),
    param("index").isInt({ min: 0 }).withMessage("index must be a valid number"),
    body("value").isString().trim().notEmpty().withMessage("value is required")
  ],
  validateRequest,
  updatePolicyListEntryAdmin
);
router.delete(
  "/policy/config/:listName/:index",
  [
    param("listName")
      .isIn(["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns"])
      .withMessage("Invalid policy list"),
    param("index").isInt({ min: 0 }).withMessage("index must be a valid number")
  ],
  validateRequest,
  deletePolicyListEntryAdmin
);
router.post("/policy/config/reset", resetPolicyConfigAdmin);
router.get("/simulation-modules", getSimulationModules);
router.get("/simulation-modules/prompt-insights", getSimulationPromptInsights);
router.post(
  "/simulation-modules/prompt-insights/disregard",
  [body("sourcePrompt").isString().trim().notEmpty().withMessage("sourcePrompt is required")],
  validateRequest,
  disregardSimulationPromptInsight
);
router.post(
  "/simulation-modules/draft",
  [
    body("mode").optional().isIn(["manual", "from_prompt"]).withMessage("mode must be manual or from_prompt"),
    body("title").optional().isString().trim().notEmpty().withMessage("title cannot be empty"),
    body("category").optional().isString().trim().notEmpty().withMessage("category cannot be empty"),
    body("sourcePrompt").optional().isString().trim().notEmpty().withMessage("sourcePrompt cannot be empty"),
    body("occurrences").optional().isInt({ min: 1 }).withMessage("occurrences must be a positive integer")
  ],
  validateRequest,
  generateSimulationModuleDraft
);
router.post(
  "/simulation-modules",
  [
    body("mode").optional().isIn(["manual", "from_prompt"]).withMessage("mode must be manual or from_prompt"),
    body("title").optional().isString().trim().notEmpty().withMessage("title cannot be empty"),
    body("category").optional().isString().trim().notEmpty().withMessage("category cannot be empty"),
    body("enabled").optional().isBoolean().withMessage("enabled must be boolean"),
    body("sourcePrompt").optional().isString().trim().notEmpty().withMessage("sourcePrompt cannot be empty"),
    body("simulation").optional().isObject().withMessage("simulation must be an object"),
    body("occurrences").optional().isInt({ min: 1 }).withMessage("occurrences must be a positive integer")
  ],
  validateRequest,
  createSimulationModule
);
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
router.delete(
  "/simulation-modules/:id",
  [param("id").isString().notEmpty().withMessage("Valid module id is required")],
  validateRequest,
  deleteSimulationModule
);

module.exports = router;
