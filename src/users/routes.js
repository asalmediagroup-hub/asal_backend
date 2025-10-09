const router = require("express").Router();
const { listUsers, getUser, createUser, updateUser, deleteUser } = require("./controller");
const { guard } = require("./auth/middleware");

// All routes under /api/users require auth; only admins can manage users
router.use(guard);

router
    .route("/")
    .get(listUsers)
    .post(createUser);

router
    .route("/:id")
    .get(getUser)
    .patch(updateUser)
    .delete(deleteUser);

module.exports = router;
