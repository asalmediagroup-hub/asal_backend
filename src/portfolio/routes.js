// src/portfolio/routes.js
const router = require("express").Router();

const {
    listPortfolio,
    getPortfolio,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
} = require("./controller");

const { guard } = require("../users/auth/middleware");
const { upload, toBase64 } = require("../config/upload");

// Normalize multer files into req.body as base64 strings (items[i][image])
function mapFilesIntoBody(req, _res, next) {
    if (!req.body) req.body = {};
    if (!Array.isArray(req.files)) req.files = [];

    // Build map by fieldname
    const byField = req.files.reduce((acc, f) => {
        (acc[f.fieldname] ||= []).push(f);
        return acc;
    }, {});

    // Ensure items array is present for merging
    if (!req.body.items) req.body.items = [];
    const ensureItem = (i) => {
        while (req.body.items.length <= i) req.body.items.push({});
        if (!req.body.items[i] || typeof req.body.items[i] !== "object") {
            req.body.items[i] = {};
        }
        return req.body.items[i];
    };

    // 1) items[i][image] files → set image base64 string per index
    for (const f of req.files) {
        const m = /^items\[(\d+)\]\[image\]$/.exec(f.fieldname);
        if (!m) continue;
        const idx = Number(m[1]);
        const item = ensureItem(idx);
        const base64 = toBase64(f);
        if (base64) item.image = base64;
    }

    // 2) Merge items scalar fields coming as multipart keys:
    //    items[0][title], items[0][description], items[0][date], items[0][category],
    //    items[0][video], items[0][text]
    for (const [k, v] of Object.entries(req.body)) {
        const m = /^items\[(\d+)\]\[(\w+)\]$/.exec(k);
        if (!m) continue;
        const idx = Number(m[1]);
        const prop = m[2];
        const item = ensureItem(idx);
        item[prop] = v;
        // Optionally: delete req.body[k];
    }

    next();
}

// Public
router.get("/", listPortfolio);
router.get("/:id", getPortfolio);

// Create (singleton guard handled in controller)
router.post(
    "/",
    guard,
    upload.any(),  // fileFilter should restrict to images in ../config/upload
    mapFilesIntoBody,
    createPortfolio
);

// Update
router.patch(
    "/:id",
    guard,
    upload.any(),
    mapFilesIntoBody,
    updatePortfolio
);

// Delete
router.delete("/:id", guard, deletePortfolio);

module.exports = router;
