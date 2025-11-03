// src/partnersReviews/routes.js
const router = require("express").Router();

const {
    listPartnersReviews,
    getPartnersReview,
    createPartnersReview,
    updatePartnersReview,
    deletePartnersReview,
} = require("./controller");

const { guard } = require("../users/auth/middleware");
const { upload, toBase64 } = require("../config/upload");

// Normalize multer files & multipart scalar fields into req.body
function mapFilesIntoBody(req, _res, next) {
    if (!req.body) req.body = {};
    if (!Array.isArray(req.files)) req.files = [];

    // Build map by fieldname
    const byField = req.files.reduce((acc, f) => {
        (acc[f.fieldname] ||= []).push(f);
        return acc;
    }, {});

    // If later you add any top-level images (e.g., bannerImage), list them here:
    // const TOP = ["bannerImage"];
    const TOP = [];
    for (const k of TOP) {
        const f = byField[k]?.[0];
        if (f) {
            const base64 = toBase64(f);
            if (base64) req.body[k] = base64;
        }
    }

    // Ensure items is an array we can mutate (when using multipart)
    if (!req.body.items || typeof req.body.items === "string") {
        // For multipart we'll rebuild from individual keys like items[0][...]
        req.body.items = [];
    }
    const ensureItem = (i) => {
        while (req.body.items.length <= i) req.body.items.push({});
        if (!req.body.items[i] || typeof req.body.items[i] !== "object") {
            req.body.items[i] = {};
        }
        return req.body.items[i];
    };

    // Map item image files: items[i][image]
    for (const f of req.files) {
        const m = /^items\[(\d+)\]\[image\]$/.exec(f.fieldname);
        if (!m) continue;
        const idx = Number(m[1]);
        const item = ensureItem(idx);
        const base64 = toBase64(f);
        if (base64) item.image = base64;
    }

    // Merge scalar fields coming as multipart keys:
    // items[0][title], items[0][message], items[0][authorName], items[0][starsNo], ...
    for (const [k, v] of Object.entries(req.body)) {
        const m = /^items\[(\d+)\]\[(\w+)\]$/.exec(k);
        if (!m) continue;
        const idx = Number(m[1]);
        const prop = m[2];
        const item = ensureItem(idx);
        item[prop] = v;
        // (optional) delete req.body[k];
    }

    next();
}

// Public
router.get("/", listPartnersReviews);
router.get("/:id", getPartnersReview);

// Create
router.post(
    "/",
    guard,
    upload.any(),     // fileFilter should already restrict to images
    mapFilesIntoBody, // normalize multipart into req.body.items[*]
    createPartnersReview
);

// Update (PATCH semantics)
router.patch(
    "/:id",
    guard,
    upload.any(),
    mapFilesIntoBody,
    updatePartnersReview
);

// Delete
router.delete("/:id", guard, deletePartnersReview);

module.exports = router;
