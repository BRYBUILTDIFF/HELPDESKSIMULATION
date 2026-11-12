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
const { isPlainLanguagePolicyEntry } = require("../store/policyConfigStore");

const router = express.Router();

function validatePlainLanguageRule(value, { req }) {
  if (!isPlainLanguagePolicyEntry(String(req.params.listName || ""), value)) {
    throw new Error("Use plain English without regular-expression symbols such as \\b, ^, |, parentheses, or *");
  }
  return true;
}

router.use(verifyToken, requireAdmin, require("../middleware/adminAudit"));
const { requestLimit } = require("../middleware/requestLimits");
router.use((req, res, next) => ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)
  ? requestLimit("admin-writes", { max: 60, windowMs: 60000, key: req => req.user.id })(req, res, next) : next());
router.post("/simulation-modules/draft", requestLimit("admin-generation", { max: 10, windowMs: 3600000, key: req => req.user.id }));
router.post("/simulation-modules", (req, res, next) => req.body?.mode === "from_prompt"
  ? requestLimit("admin-generation", { max: 10, windowMs: 3600000, key: req => req.user.id })(req, res, next) : next());
router.post("/session-restrictions/:userId/reset", [param("userId").isInt({ min: 1 }).toInt(), body("sessionId").isString().isLength({ min: 1, max: 120 })], validateRequest, async (req, res, next) => {
  try {
    await require("../prisma").sessionRestriction.deleteMany({ where: { userId: req.params.userId, sessionId: req.body.sessionId } });
    return res.json({ reset: true });
  } catch (error) { next(error); }
});
router.get("/session-restrictions", async (_req, res, next) => {
  try { return res.json({ restrictions: await require("../prisma").sessionRestriction.findMany({ where: { expiresAt: { gt: new Date() } }, take: 200, orderBy: { expiresAt: "desc" } }) }); }
  catch (error) { next(error); }
});
router.get("/audit", async (_req, res, next) => {
  try { const rows = await require("../prisma").adminAuditLog.findMany({ take: 200, orderBy: { at: "desc" } }); return res.json({ events: rows.map(row => ({ ...row, id: String(row.id) })) }); }
  catch (err) { return next(err); }
});

const labRecovery = require("../controllers/simulationSessionController");
router.get("/simulation-sessions/stuck", labRecovery.listStuckSessions);
router.post("/simulation-sessions/:id/retry-termination", [param("id").isLength({ min: 1, max: 120 })], validateRequest, labRecovery.retryTermination);
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
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean").toBoolean()
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
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean").toBoolean()
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
router.put("/policy/config", [
  ...["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns", "safetyBlockedKeywords"].flatMap(name => [
    body(name).isArray({ max: 500 }), body(`${name}.*`).isString().isLength({ min: 1, max: 200 })
  ]),
  body("messages").optional().isObject(), body("messages.*").optional().isString().isLength({ max: 1000 })
], validateRequest, replacePolicyConfigAdmin);
router.post("/policy/config/reset", resetPolicyConfigAdmin);
router.post(
  "/policy/config/:listName",
  [
    param("listName")
      .isIn(["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns", "safetyBlockedKeywords"])
      .withMessage("Invalid policy list"),
    body("value").isString().trim().notEmpty().withMessage("value is required").custom(validatePlainLanguageRule)
  ],
  validateRequest,
  addPolicyListEntryAdmin
);
router.patch(
  "/policy/config/:listName/:index",
  [
    param("listName")
      .isIn(["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns", "safetyBlockedKeywords"])
      .withMessage("Invalid policy list"),
    param("index").isInt({ min: 0 }).withMessage("index must be a valid number"),
    body("value").isString().trim().notEmpty().withMessage("value is required").custom(validatePlainLanguageRule)
  ],
  validateRequest,
  updatePolicyListEntryAdmin
);
router.delete(
  "/policy/config/:listName/:index",
  [
    param("listName")
      .isIn(["greetingPatterns", "inScopeKeywords", "outOfScopeKeywords", "inScopeIntentPatterns", "safetyBlockedKeywords"])
      .withMessage("Invalid policy list"),
    param("index").isInt({ min: 0 }).withMessage("index must be a valid number")
  ],
  validateRequest,
  deletePolicyListEntryAdmin
);
router.post("/simulation-modules/test", require("../controllers/simulationAttemptController").testDefinition);
router.get("/simulation-modules/actions", (_req, res) => res.json({ actions: require("../services/terminalRuntime").ACTIONS }));
router.get("/simulation-modules", getSimulationModules);
router.get("/simulation-modules/prompt-insights", getSimulationPromptInsights);
router.post(
  "/simulation-modules/prompt-insights/disregard",
  [
    body("sourcePrompt").isString().trim().notEmpty().withMessage("sourcePrompt is required"),
    body("insightKey").optional().isString().trim().isLength({ max: 500 })
  ],
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
    body("enabled").optional().isBoolean().withMessage("enabled must be boolean").toBoolean(),
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
    body("enabled").optional().isBoolean().withMessage("enabled must be boolean").toBoolean(),
    body("difficulty").optional().isIn(["Easy", "Medium", "Hard"]).withMessage("difficulty must be Easy, Medium, or Hard"),
    body("title").optional().isString().trim().isLength({ min: 1, max: 160 }),
    body("category").optional().isString().trim().isLength({ min: 1, max: 80 }),
    body("simulation").optional().isObject()
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
