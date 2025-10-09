const router = require("express").Router();
const {
    listCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory,
} = require("./conroller");
const { guard } = require("../users/auth/middleware");

// Protect all category routes
router.use(guard);

router
    .route("/")
    .get(listCategories)
    .post(createCategory);

router
    .route("/:id")
    .get(getCategory)
    .patch(updateCategory)
    .delete(deleteCategory);

module.exports = router;
