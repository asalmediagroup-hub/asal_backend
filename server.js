const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

dotenv.config();

const app = express();

// ============ Multer Setup ============

// Upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage config using Date.now() for unique filenames
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        cb(null, `${Date.now()}${ext}`);
    },
});

// File filter to allow only images
const fileFilter = (_req, file, cb) => {
    const isImage = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype);
    if (isImage) return cb(null, true);
    return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "image"));
};

// 5MB file size limit
const limits = { fileSize: parseInt(process.env.MAX_FILE_SIZE || "5242880", 10) };

const upload = multer({ storage, fileFilter, limits });

// Serve uploaded files statically
app.use("/uploads", express.static(UPLOAD_DIR));

// Upload route
app.post("/api/uploads/image", upload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // Public URL for the file
    const url = `/uploads/${req.file.filename}`;
    return res.status(201).json({
        filename: req.file.filename,
        url,
        size: req.file.size,
        mimetype: req.file.mimetype,
    });
});

// ============ Middlewares ============

// Security headers
app.use(helmet());

// TEMPORARY: Allow all origins
app.use(
  cors({
    origin: function (origin, callback) {
      callback(null, true); // allow any origin
    },
    credentials: true, // allow cookies / authorization headers
  })
);

// JSON body parser
app.use(express.json());

// Cookie parser
app.use(cookieParser());

// Request logger
app.use(morgan("dev"));

// Gzip compression
app.use(compression());

// ============ DB Connect ============

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((e) => {
        console.error("Mongo connection error:", e.message);
        process.exit(1);
    });

// ============ Routes ============

app.use("/api/auth", require("./src/users/auth/routes"));
app.use("/api/users", require("./src/users/routes"));
app.use("/api/roles", require("./src/roles/routes"));
app.use("/api/categories", require("./src/categories/routes"));
app.use("/api/services", require("./src/services/routes"));
app.use("/api/brands", require("./src/brands/routes"));
app.use("/api/packages", require("./src/pqackages/routes"));
app.use("/api/news", require("./src/news/routes"));
app.use("/api/portfolio", require("./src/portfolio/routes"));
app.use("/api/partners-reviews", require("./src/partnersReviews/routes"));

app.get("/", (_req, res) => res.send("API OK"));

// ============ Error Handling for Multer ============

app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: "File too large",
            LIMIT_UNEXPECTED_FILE: "Only image files are allowed",
        };
        return res.status(400).json({ message: messages[err.code] || "Upload error" });
    }
    if (err) {
        console.error("Unhandled error:", err);
        return res.status(500).json({ message: "Server error" });
    }
    return res.status(500).json({ message: "Unknown error" });
});

// ============ Start Server ============

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
