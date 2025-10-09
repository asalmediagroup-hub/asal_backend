// src/news/routes.js
const router = require("express").Router();
const path = require("path");

const {
    listNews,
    getNews,
    createNews,
    updateNews,
    deleteNews,
} = require("./controller");
const { guard } = require("../users/auth/middleware");
const { upload } = require("../config/upload");

// Normalize multer files into req.body as web paths
function mapFilesIntoBody(req, _res, next) {
    if (!req.body) req.body = {};
    if (!Array.isArray(req.files)) req.files = [];

    // Build map by fieldname
    const byField = req.files.reduce((acc, f) => {
        (acc[f.fieldname] ||= []).push(f);
        return acc;
    }, {});

    const toWeb = (f) => {
        const name = f?.filename || (f?.path ? path.basename(f.path) : null);
        return name ? `/uploads/${name}` : null;
    };

    // Ensure items array is present for merging
    if (!req.body.items) req.body.items = [];
    const ensureItem = (i) => {
        while (req.body.items.length <= i) req.body.items.push({});
        if (!req.body.items[i] || typeof req.body.items[i] !== "object") {
            req.body.items[i] = {};
        }
        return req.body.items[i];
    };

    // 1) items[i][image] files → set image web path per index
    for (const f of req.files) {
        const m = /^items\[(\d+)\]\[image\]$/.exec(f.fieldname);
        if (!m) continue;
        const idx = Number(m[1]);
        const item = ensureItem(idx);
        const web = toWeb(f);
        if (web) item.image = web;
    }

    // 2) Merge items scalar fields coming as multipart keys:
    //    items[0][title], items[0][description], items[0][author], items[0][date], items[0][fullNews], items[0][order]
    for (const [k, v] of Object.entries(req.body)) {
        const m = /^items\[(\d+)\]\[(\w+)\]$/.exec(k);
        if (!m) continue;
        const idx = Number(m[1]);
        const prop = m[2];
        const item = ensureItem(idx);
        item[prop] = v;
        // Optionally delete the raw key:
        // delete req.body[k];
    }

    next();
}

// Public
router.get("/", listNews);
router.get("/:id", getNews);

// Create
router.post(
    "/",
    guard,
    upload.any(),       // fileFilter should restrict to images in ../config/upload
    mapFilesIntoBody,
    createNews
);

// Update
router.patch(
    "/:id",
    guard,
    upload.any(),
    mapFilesIntoBody,
    updateNews
);

// Delete
router.delete("/:id", guard, deleteNews);

module.exports = router;
