const path = require("path");
const fs = require("fs");
const multer = require("multer");

// Directory where uploads are stored
const UPLOAD_DIR = path.join(__dirname, "../../uploads");

// Ensure the uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer disk storage
const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (_req, file, cb) {
        // Keep original extension; prepend timestamp to avoid name collisions
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext);
        cb(null, `${base}-${Date.now()}${ext}`);
    },
});

// File filter (optional: only allow images)
function fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
        return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

module.exports = { upload, UPLOAD_DIR };
