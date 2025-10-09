const router = require("express").Router();
const { listRoles, getRole, createRole, updateRole, deleteRole } = require("./controller");
const { guard } = require("../users/auth/middleware");

router.use(guard);

router.route("/")
    .get(listRoles)
    .post(createRole);

router.route("/:id")
    .get(getRole)
    .patch(updateRole)
    .delete(deleteRole);

module.exports = router;


