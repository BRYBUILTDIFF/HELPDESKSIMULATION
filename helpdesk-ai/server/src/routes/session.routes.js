const express = require("express");
const { body, param } = require("express-validator");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/sessionController");
const router = express.Router();
router.use(verifyToken);
router.use((req, res, next) => ["PUT", "DELETE"].includes(req.method)
  ? require("../middleware/requestLimits").requestLimit("session-writes", { max: 120, windowMs: 60000, key: req => req.user.id })(req, res, next) : next());
router.get("/", controller.getMySessions);
router.delete("/", controller.deleteMyData);
const idRule = () => param("id").isString().isLength({ min: 1, max: 120 });
router.put("/:id", [idRule(), body("session").isObject()], validateRequest, controller.saveSession);
router.delete("/:id", [idRule()], validateRequest, controller.deleteSession);
module.exports = router;
