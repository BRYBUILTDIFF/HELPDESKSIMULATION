const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();
const mfa = require('../controllers/adminMfaController');
router.use('/admin-mfa', verifyToken, (req,res,next) => req.user.role === 'ADMIN' ? next() : res.status(403).json({message:'Forbidden'}), require('../middleware/requestLimits').requestLimit('admin-mfa', {max:10,windowMs:60000,key:req=>req.user.id}));
router.get('/admin-mfa/status', mfa.status);
router.post('/admin-mfa/enroll', [body('password').isString().isLength({min:1,max:72})], validateRequest, mfa.enroll);
router.post('/admin-mfa/verify', [body('password').isString().isLength({min:1,max:72}),body('code').isString().matches(/^\d{6}$/)], validateRequest, mfa.verify);
router.post('/admin-mfa/recover', [body('password').isString().isLength({min:1,max:72}),body('code').isString().matches(/^[a-f0-9]{24}$/)], validateRequest, mfa.recover);

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

router.post("/login", [emailRule, passwordRule], validateRequest, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/logout-all", verifyToken, authController.logoutAll);
router.get("/me", verifyToken, authController.getMe);
router.post(
  "/change-password",
  verifyToken,
  [
    body("currentPassword").isString().notEmpty().withMessage("Current password is required"),
    body("newPassword")
      .isString()
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters")
  ],
  validateRequest,
  authController.changePassword
);

module.exports = router;
