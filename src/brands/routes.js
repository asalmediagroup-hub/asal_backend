// src/brands/routes.js
const router = require("express").Router();

const {
    listBrands,
    getBrand,
    createBrand,
    updateBrand,
    deleteBrand,
} = require("./controller");
const { guard } = require("../users/auth/middleware");
const { upload, toBase64 } = require("../config/upload");

// Normalize multer files into req.body as base64 strings
function mapFilesIntoBody(req, _res, next) {
    if (!req.body) req.body = {};
    if (!Array.isArray(req.files)) req.files = [];

    // Build map by fieldname
    const byField = req.files.reduce((acc, f) => {
        (acc[f.fieldname] ||= []).push(f);
        return acc;
    }, {});

    // 1) Top-level single images → base64 string
    const TOP = ["heroBgImage", "heroBgImageMobile", "aboutImage", "screenshotImage"];
    for (const k of TOP) {
        const f = byField[k]?.[0];
        if (f) {
            const base64 = toBase64(f);
            if (base64) req.body[k] = base64;
        }
    }

    // 2) featuredItems[i][image] files
    if (!req.body.featuredItems) req.body.featuredItems = [];
    const ensureItem = (i) => {
        while (req.body.featuredItems.length <= i) req.body.featuredItems.push({});
        if (!req.body.featuredItems[i] || typeof req.body.featuredItems[i] !== "object") {
            req.body.featuredItems[i] = {};
        }
        return req.body.featuredItems[i];
    };

    for (const f of req.files) {
        const m = /^featuredItems\[(\d+)\]\[image\]$/.exec(f.fieldname);
        if (!m) continue;
        const idx = Number(m[1]);
        const item = ensureItem(idx);
        const base64 = toBase64(f);
        if (base64) item.image = base64;
    }

    // 3) Merge featuredItems scalar fields that come as multipart keys:
    //    featuredItems[0][title], featuredItems[0][description], etc.
    for (const [k, v] of Object.entries(req.body)) {
        const m = /^featuredItems\[(\d+)\]\[(\w+)\]$/.exec(k);
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
router.get("/", listBrands);
router.get("/:id", getBrand);

// Create
router.post(
    "/",
    guard,
    upload.any(),        // fileFilter still restricts to images
    mapFilesIntoBody,
    createBrand
);

// Update
router.patch(
    "/:id",
    guard,
    upload.any(),
    mapFilesIntoBody,
    updateBrand
);

router.delete("/:id", guard, deleteBrand);

module.exports = router;