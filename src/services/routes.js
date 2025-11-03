const router = require("express").Router();
const {
    listServices,
    getService,
    createService,
    updateService,
    deleteService,
} = require("./controller");
const { guard } = require("../users/auth/middleware"); // auth for write ops only
const { upload, toBase64 } = require("../config/upload"); // multer config for images

// Middleware to convert uploaded image to base64
function convertImageToBase64(req, res, next) {
    if (req.file) {
        const base64 = toBase64(req.file);
        if (base64) {
            req.body.image = base64;
        }
    }
    next();
}

// Public: anyone can read
router.get("/", listServices);
router.get("/:id", getService);

// Protected: only authenticated (e.g., admins) can modify
router.post("/", guard, upload.single("image"), convertImageToBase64, createService);
router.patch("/:id", guard, upload.single("image"), convertImageToBase64, updateService);
router.delete("/:id", guard, deleteService);

module.exports = router;
