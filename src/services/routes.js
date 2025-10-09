const router = require("express").Router();
const {
    listServices,
    getService,
    createService,
    updateService,
    deleteService,
} = require("./controller");
const { guard } = require("../users/auth/middleware"); // auth for write ops only
const { upload } = require("../config/upload"); // multer config for images

// Public: anyone can read
router.get("/", listServices);
router.get("/:id", getService);

// Protected: only authenticated (e.g., admins) can modify
router.post("/", guard, upload.single("image"), createService);
router.patch("/:id", guard, upload.single("image"), updateService);
router.delete("/:id", guard, deleteService);

module.exports = router;
