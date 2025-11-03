const multer = require("multer");

// Multer memory storage - stores file in memory as buffer
const storage = multer.memoryStorage();

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

/**
 * Convert file buffer to base64 data URI
 * @param {Object} file - Multer file object with buffer and mimetype
 * @returns {string|null} - Base64 data URI or null if invalid
 */
function toBase64(file) {
    if (!file || !file.buffer || !file.mimetype) return null;
    const base64 = file.buffer.toString("base64");
    return `data:${file.mimetype};base64,${base64}`;
}

module.exports = { upload, toBase64 };
