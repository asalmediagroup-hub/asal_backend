const router = require("express").Router();
const { register, login } = require("./controller");
const { guard } = require("./middleware");

router.post("/register", guard, register);
router.post("/login", login);

module.exports = router;
